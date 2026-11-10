/**
 * The 3D flight stage: an imperative three.js scene that plays back a precomputed flight.
 *
 * Phone-friendly by construction: WebGL2, pixel ratio capped at 2 (lowered when frames run long), no
 * post-processing, no shadow maps (one soft blob under the plane), instanced props, and a render loop
 * that allocates nothing and stops while the page is hidden.
 */
import * as THREE from 'three';
import { terrainHeight } from '../../../core/env';
import { launchAttitude, launchVelocity } from '../../../core/sim';
import { createWindField, resolveWind } from '../../../core/wind';
import type { Airframe, Conditions, Environment, FlightResult, Launch, PaperSpec, PosedModel, Vec3 } from '../../../core/types';
import type { UnitSystem } from '../../../ui/format';
import { CameraRig, type CameraMode } from './cameraRig';
import { buildBlobGeometry, buildPlaneGeometry } from './planeMesh';
import { createLiveSample, flightDuration, PlaybackClock, sampleInto, type LiveSample } from './playback';
import { buildScenery, disposeTree, type Scenery } from './scenery';
import { buildTape } from './tape';
import { poseWindsock, WindParticles } from './windViz';

export interface FlightStageOptions {
  reducedMotion?: boolean;
  units?: UnitSystem;
}

/** Points of the trail ribbon per second of flight. */
const TRAIL_HZ = 60;
const TRAIL_WIDTH = 0.005;
const AIM_POINTS = 48;
const MAX_PIXEL_RATIO = 2;

/** True when this browser can give us a WebGL2 context. */
export function isWebGL2Available(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export class FlightStageEngine {
  /** Called every frame with the flight at the play head (the object is reused: copy what you keep). */
  onFrame: ((sample: LiveSample) => void) | null = null;
  /** Called once when playback reaches the end of the flight. */
  onEnd: (() => void) | null = null;
  /** Called when the GPU context is lost (true) or restored (false). */
  onContextChange: ((lost: boolean) => void) | null = null;

  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.03, 3000);
  private readonly rig: CameraRig;
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly planeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
  private readonly hemi = new THREE.HemisphereLight(0xfff8ec, 0x9a8a70, 1.55);

  private readonly planeRoot = new THREE.Group();
  private readonly planeBody = new THREE.Mesh(new THREE.BufferGeometry(), this.planeMaterial);
  private readonly blob: THREE.Mesh;
  private readonly trail: THREE.Mesh;
  private readonly trailMaterial = new THREE.MeshBasicMaterial({ color: 0xd9694c, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  private readonly ghostGroup = new THREE.Group();
  private readonly ghostMaterial = new THREE.LineBasicMaterial({ color: 0x6b665c, transparent: true, opacity: 0.35 });
  private readonly aim: THREE.Line;
  private readonly particles = new WindParticles();

  private scenery: Scenery | null = null;
  private tape: THREE.Mesh | null = null;
  private env: Environment | null = null;
  private wind: ReturnType<typeof createWindField> | null = null;
  private flight: FlightResult | null = null;
  private planeSize = 0.25;
  private units: UnitSystem;
  private reduced: boolean;

  private readonly clock = new PlaybackClock();
  private readonly sample = createLiveSample();
  private readonly launchPos = new THREE.Vector3(0, 1.8, 0);
  private readonly focus = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly windOut: [number, number, number] = [0, 0, 0];
  private readonly sockPos: [number, number, number] = [0, 0, 0];
  private readonly readyQuat = new THREE.Quaternion();
  private readonly readyVel = new THREE.Vector3(7, 0, 0);
  private readonly bobQuat = new THREE.Quaternion();
  private readonly bobEuler = new THREE.Euler();

  private userMode: CameraMode = 'chase';
  private orbitEnabled = false;
  private running = false;
  private visible = true;
  private contextLost = false;
  private lastNow = 0;
  private wall = 0;
  private snapCamera = true;
  private slowFrames = 0;
  private pixelRatio: number;
  private readonly insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly host: HTMLElement, options: FlightStageOptions = {}) {
    this.units = options.units ?? 'metric';
    this.reduced = options.reducedMotion ?? false;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ppl-stage__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    // WebGL1 is not supported by three r163+: this throws when there is no WebGL2, and the caller falls back.
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'default' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.canvas);

    this.rig = new CameraRig(this.camera);
    this.material.userData.shared = true;
    this.sun.position.set(-30, 60, 25);
    this.scene.add(this.hemi, this.sun);

    this.planeRoot.add(this.planeBody);
    this.scene.add(this.planeRoot);

    this.blob = new THREE.Mesh(buildBlobGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.blob.renderOrder = 1;
    this.scene.add(this.blob);

    this.trail = new THREE.Mesh(new THREE.BufferGeometry(), this.trailMaterial);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 2;
    this.scene.add(this.trail, this.ghostGroup, this.particles.mesh);

    const aimGeo = new THREE.BufferGeometry();
    aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_POINTS * 3), 3));
    this.aim = new THREE.Line(aimGeo, new THREE.LineBasicMaterial({ color: 0xfffaf0, transparent: true, opacity: 0.8, depthTest: false }));
    this.aim.frustumCulled = false;
    this.aim.visible = false;
    this.aim.renderOrder = 3;
    this.scene.add(this.aim);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    this.canvas.addEventListener('webglcontextlost', this.handleLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleRestored);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.setLaunch({ speed: 7, pitchDeg: 5, yawDeg: 0, rollDeg: 0, aoaDeg: 0 });
    this.start();
  }

  /* ---------------------------------------------------------------- public API */

  setEnvironment(env: Environment, conditions?: Conditions): void {
    if (this.scenery) {
      this.scene.remove(this.scenery.group);
      this.scenery.dispose();
    }
    this.env = env;
    this.scenery = buildScenery(env, this.material);
    this.scene.add(this.scenery.group);
    this.scene.background = this.scenery.sky;
    // Indoors the light bounces off a pale floor; outdoors off grass.
    this.hemi.groundColor.set(env.indoor ? 0xe6d6b8 : 0x9a8a70);
    this.hemi.intensity = env.indoor ? 2.5 : 1.6;
    this.sun.intensity = env.indoor ? 1.1 : 2.2;
    this.scene.fog = new THREE.Fog(this.scenery.sky, this.scenery.fogNear, this.scenery.fogFar);
    this.launchPos.set(env.launch[0], env.launch[1], env.launch[2]);
    this.rig.bounds = env.bounds;
    this.rig.groundAt = (x) => terrainHeight(env.terrain, x);
    this.rig.scale = env.id === 'classroom' ? 0.9 : 1;
    this.rebuildTape();
    this.setConditions(conditions ?? { envId: env.id });
    this.snapCamera = true;
  }

  /** Wind settings for the particles and the windsock (the flight itself already contains its wind). */
  setConditions(conditions: Conditions): void {

    const env = this.env;
    if (!env) return;
    this.wind = env.indoor ? null : createWindField(resolveWind(env, conditions), 7, env);
    this.particles.setField(this.wind, env);
  }

  setPlane(model: PosedModel, paper: PaperSpec, airframe: Airframe): void {
    this.planeBody.geometry.dispose();
    this.planeBody.geometry = buildPlaneGeometry(model, paper);
    // The mesh is in body coordinates (origin at the tail); the simulation moves the CG.
    this.planeBody.position.set(-airframe.cg[0], -airframe.cg[1], -airframe.cg[2]);
    this.planeSize = Math.max(model.length, model.span, 0.1);
  }

  setFlight(result: FlightResult | null): void {
    this.flight = result;
    this.clock.reset(flightDuration(result));
    this.buildTrail();
    this.snapCamera = this.userMode === 'thrower';
  }

  /** The throw shown in the ready pose (before a flight exists). */
  setLaunch(launch: Launch): void {
    const a = launchAttitude(launch);
    this.readyQuat.set(a[0], a[1], a[2], a[3]);
    const v = launchVelocity(launch);
    this.readyVel.set(v[0], v[1], v[2]);
  }

  /** Faint ballistic aiming arc from the release point, or null to hide it. */
  setAim(launch: Launch | null): void {
    if (!launch) {
      this.aim.visible = false;
      return;
    }
    const v = launchVelocity(launch);
    const attr = this.aim.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const span = Math.min(1.2, 0.25 + launch.speed * 0.06);
    for (let i = 0; i < AIM_POINTS; i++) {
      const t = (i / (AIM_POINTS - 1)) * span;
      arr[i * 3] = this.launchPos.x + v[0] * t;
      arr[i * 3 + 1] = this.launchPos.y + v[1] * t - 0.5 * 9.81 * t * t * 0.35;
      arr[i * 3 + 2] = this.launchPos.z + v[2] * t;
    }
    attr.needsUpdate = true;
    this.aim.visible = true;
  }

  /**
   * Screen space covered by overlays, CSS px. The camera's centre of view moves into the free area so the
   * plane is never framed behind a panel.
   */
  setInsets(insets: { top?: number; right?: number; bottom?: number; left?: number }): void {
    this.insets.top = insets.top ?? 0;
    this.insets.right = insets.right ?? 0;
    this.insets.bottom = insets.bottom ?? 0;
    this.insets.left = insets.left ?? 0;
    this.resize();
  }

  setTime(t: number): void {
    this.clock.seek(t);
  }

  getTime(): number {
    return this.clock.t;
  }

  getDuration(): number {
    return this.clock.duration;
  }

  isPlaying(): boolean {
    return this.clock.playing;
  }

  play(): void {
    this.clock.play();
    if (this.rig.mode === 'orbit' && this.userMode !== 'orbit') this.rig.mode = this.userMode;
  }

  pause(): void {
    this.clock.playing = false;
  }

  setRate(rate: number): void {
    this.clock.rate = rate;
  }

  setCamera(mode: CameraMode): void {
    this.userMode = mode;
    if (mode === 'orbit') this.rig.beginOrbit(this.focus);
    else this.rig.mode = mode;
  }

  /** Drag to orbit (used when paused or after landing). */
  setOrbitEnabled(on: boolean): void {
    this.orbitEnabled = on;
    this.canvas.style.cursor = on ? 'grab' : '';
  }

  setGhosts(trails: readonly (readonly Vec3[])[]): void {
    for (const c of [...this.ghostGroup.children]) {
      this.ghostGroup.remove(c);
      (c as THREE.Line).geometry.dispose();
    }
    trails.forEach((trail, i) => {
      if (trail.length < 2) return;
      const arr = new Float32Array(trail.length * 3);
      trail.forEach((p, k) => arr.set(p, k * 3));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const line = new THREE.Line(g, this.ghostMaterial);
      line.renderOrder = 2 + i;
      this.ghostGroup.add(line);
    });
  }

  setUnits(units: UnitSystem): void {
    if (units === this.units) return;
    this.units = units;
    this.rebuildTape();
  }

  setReducedMotion(on: boolean): void {
    this.reduced = on;
  }

  /** Try to get the GPU context back after a loss. */
  restoreContext(): void {
    this.renderer.forceContextRestore();
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    if (this.scenery) this.scenery.dispose();
    this.particles.dispose();
    this.setGhosts([]);
    disposeTree(this.scene);
    this.material.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.onFrame = null;
    this.onEnd = null;
    this.onContextChange = null;
  }

  /* ---------------------------------------------------------------- internals */

  private rebuildTape(): void {
    if (this.tape) {
      this.scene.remove(this.tape);
      this.tape.geometry.dispose();
      this.tape = null;
    }
    if (!this.env) return;
    this.tape = buildTape(this.env, this.units, this.material);
    if (this.tape) this.scene.add(this.tape);
  }

  private buildTrail(): void {
    this.trail.geometry.dispose();
    const g = new THREE.BufferGeometry();
    const f = this.flight;
    if (f && f.samples.length > 1) {
      const stride = Math.max(1, Math.round(f.sampleHz / TRAIL_HZ));
      const idx: number[] = [];
      for (let i = 0; i < f.samples.length; i += stride) idx.push(i);
      if (idx[idx.length - 1] !== f.samples.length - 1) idx.push(f.samples.length - 1);
      const pos = new Float32Array(idx.length * 6);
      const span = new THREE.Vector3();
      const q = new THREE.Quaternion();
      idx.forEach((si, k) => {
        const s = f.samples[si];
        q.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
        span.set(0, 0, TRAIL_WIDTH).applyQuaternion(q);
        pos.set([s.pos[0] - span.x, s.pos[1] - span.y, s.pos[2] - span.z, s.pos[0] + span.x, s.pos[1] + span.y, s.pos[2] + span.z], k * 6);
      });
      const index: number[] = [];
      for (let k = 0; k + 1 < idx.length; k++) {
        const a = k * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(index);
      g.userData.times = idx.map((si) => f.samples[si].t);
    }
    g.setDrawRange(0, 0);
    this.trail.geometry = g;
  }

  private revealTrail(t: number): void {
    const times = this.trail.geometry.userData.times as number[] | undefined;
    if (!times || times.length < 2) return;
    // Binary search: last trail point at or before t.
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    this.trail.geometry.setDrawRange(0, lo * 6);
  }

  private start(): void {
    if (this.running || this.contextLost || !this.visible) return;
    this.running = true;
    this.lastNow = performance.now();
    this.renderer.setAnimationLoop(this.frame);
  }

  private stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.wall += dt;
    this.adaptResolution(dt);

    const ended = this.clock.tick(dt);
    const f = this.flight;
    if (f) {
      sampleInto(f, this.clock.t, this.sample);
      this.focus.set(this.sample.pos[0], this.sample.pos[1], this.sample.pos[2]);
      this.vel.set(this.sample.vel[0], this.sample.vel[1], this.sample.vel[2]);
      this.q.set(this.sample.quat[0], this.sample.quat[1], this.sample.quat[2], this.sample.quat[3]);
      this.revealTrail(this.clock.t);
    } else {
      this.readyPose();
    }
    this.planeRoot.position.copy(this.focus);
    this.planeRoot.quaternion.copy(this.q);
    this.placeBlob();

    if (this.scenery) {
      let wx = 0;
      let wz = 0;
      if (this.wind && this.scenery.sock) {
        const p = this.scenery.sock.position;
        this.sockPos[0] = p.x;
        this.sockPos[1] = p.y;
        this.sockPos[2] = p.z;
        this.wind.mean(this.sockPos, this.wall, this.windOut);
        wx = this.windOut[0];
        wz = this.windOut[2];
        poseWindsock(this.scenery.sock, wx, wz, this.wall, this.reduced);
      }
      this.scenery.tick(dt, this.wall, wx, wz);
    }
    this.particles.update(dt, this.focus.x + 6, this.focus.z, this.reduced);

    this.rig.update(this.focus, this.vel, this.launchPos, dt, this.snapCamera);
    this.snapCamera = false;
    this.renderer.render(this.scene, this.camera);

    if (this.onFrame) {
      if (!f) this.sample.t = 0;
      this.onFrame(this.sample);
    }
    if (ended && this.onEnd) this.onEnd();
  };

  /** Plane held at the release point, gently bobbing, nose along the throw. */
  private readyPose(): void {
    const bob = this.reduced ? 0 : 1;
    this.bobEuler.set(Math.sin(this.wall * 1.7) * 0.04 * bob, 0, Math.sin(this.wall * 1.3) * 0.03 * bob);
    this.bobQuat.setFromEuler(this.bobEuler);
    this.q.copy(this.readyQuat).multiply(this.bobQuat);
    this.focus.copy(this.launchPos);
    this.focus.y += Math.sin(this.wall * 2.1) * 0.015 * bob;
    this.vel.copy(this.readyVel);
    this.sample.pos[0] = this.focus.x;
    this.sample.pos[1] = this.focus.y;
    this.sample.pos[2] = this.focus.z;
    this.sample.airspeed = 0;
    this.sample.alpha = 0;
  }

  private placeBlob(): void {
    const env = this.env;
    const gx = this.focus.x;
    const g = env ? terrainHeight(env.terrain, gx) : 0;
    const h = Math.max(0, this.focus.y - g);
    // Ground slope under the plane, so the shadow lies on hills.
    const g2 = env ? terrainHeight(env.terrain, gx + 0.5) : 0;
    this.blob.position.set(gx, g + 0.01, this.focus.z);
    this.blob.rotation.set(0, 0, Math.atan2(g2 - g, 0.5));
    const s = this.planeSize * (0.55 + Math.min(h, 20) * 0.08);
    this.blob.scale.set(s, 1, s * 0.7);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 1 / (1 + h * 0.35);
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    const i = this.insets;
    // Keep at least half the canvas as the framing area.
    const cx = Math.min(Math.max((i.left + w - i.right) / 2, w * 0.25), w * 0.75);
    const cy = Math.min(Math.max((i.top + h - i.bottom) / 2, h * 0.25), h * 0.75);
    const fw = w + 2 * Math.abs(cx - w / 2);
    const fh = h + 2 * Math.abs(cy - h / 2);
    this.camera.aspect = fw / fh;
    if (fw !== w || fh !== h) this.camera.setViewOffset(fw, fh, fw / 2 - cx, fh / 2 - cy, w, h);
    else this.camera.clearViewOffset();
    this.rig.fovScale = fh / h;
    this.camera.updateProjectionMatrix();
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  /** Lower the pixel ratio a step when frames keep running long (above 22 ms for about a second). */
  private adaptResolution(dt: number): void {
    if (dt > 0.022 && dt < 0.1) this.slowFrames++;
    else if (this.slowFrames > 0) this.slowFrames--;
    if (this.slowFrames > 60 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
      this.slowFrames = 0;
    }
  }

  private readonly handleVisibility = (): void => {
    this.visible = document.visibilityState !== 'hidden';
    if (this.visible) this.start();
    else this.stop();
  };

  private readonly handleLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.stop();
    this.onContextChange?.(true);
  };

  private readonly handleRestored = (): void => {
    this.contextLost = false;
    this.start();
    this.onContextChange?.(false);
  };

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (!this.orbitEnabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.canvas.setPointerCapture(e.pointerId);
    if (this.rig.mode !== 'orbit') this.rig.beginOrbit(this.focus);
    if (this.pointers.size === 2) this.pinchDist = this.pinchSpan();
    this.canvas.style.cursor = 'grabbing';
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.orbitEnabled) return;
    if (this.pointers.size >= 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const d = this.pinchSpan();
      if (this.pinchDist > 0 && d > 0) this.zoom(this.pinchDist / d);
      this.pinchDist = d;
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    this.rig.orbitAz += dx * 0.008;
    this.rig.orbitEl = THREE.MathUtils.clamp(this.rig.orbitEl + dy * 0.006, -0.2, 1.4);
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (this.pointers.size === 0) this.canvas.style.cursor = this.orbitEnabled ? 'grab' : '';
  };

  private readonly handleWheel = (e: WheelEvent): void => {
    if (!this.orbitEnabled) return;
    e.preventDefault();
    if (this.rig.mode !== 'orbit') this.rig.beginOrbit(this.focus);
    this.zoom(Math.exp(e.deltaY * 0.001));
  };

  private zoom(factor: number): void {
    this.rig.orbitDist = THREE.MathUtils.clamp(this.rig.orbitDist * factor, 0.35, 30);
  }

  private pinchSpan(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
