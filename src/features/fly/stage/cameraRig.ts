/**
 * Camera modes with smooth transitions: every mode computes a desired eye and target; the rig eases toward
 * them with frame-rate independent damping, so switching modes glides instead of cutting.
 */
import * as THREE from 'three';
import type { RoomBounds } from '../../../core/types';

export type CameraMode = 'chase' | 'side' | 'thrower' | 'orbit';

export const CAMERA_MODES: readonly CameraMode[] = ['chase', 'side', 'thrower', 'orbit'];

export class CameraRig {
  mode: CameraMode = 'chase';
  readonly eye = new THREE.Vector3(-2, 2.4, 0.6);
  readonly target = new THREE.Vector3(0, 1.8, 0);
  private readonly wantEye = new THREE.Vector3();
  private readonly wantTarget = new THREE.Vector3();
  private readonly heading = new THREE.Vector3(1, 0, 0);
  private fov = 50;
  private appliedFov = 0;
  /** Vertical size of the full view over the visible canvas (see FlightStageEngine.setInsets). */
  fovScale = 1;
  /** Orbit state around the plane: azimuth from -x, elevation, distance. */
  orbitAz = -0.6;
  orbitEl = 0.3;
  orbitDist = 1.6;
  /** Scale of the scene: chase and side distances grow in big places. */
  scale = 1;
  bounds: RoomBounds | null = null;
  groundAt: (x: number) => number = () => 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Start orbiting from wherever the camera is now. */
  beginOrbit(focus: THREE.Vector3): void {
    const d = this.eye.clone().sub(focus);
    this.orbitDist = Math.min(12 * this.scale, Math.max(0.5, d.length()));
    this.orbitAz = Math.atan2(d.z, -d.x);
    this.orbitEl = Math.asin(Math.max(-0.99, Math.min(0.99, d.y / this.orbitDist)));
    this.mode = 'orbit';
  }

  /**
   * `focus` = plane CG, `vel` = its velocity, `launch` = release point, `dt` = real seconds since the last
   * frame, `snap` = jump without easing.
   */
  update(focus: THREE.Vector3, vel: THREE.Vector3, launch: THREE.Vector3, dt: number, snap: boolean): void {
    const hs = Math.hypot(vel.x, vel.z);
    if (hs > 0.3) this.heading.set(vel.x / hs, 0, vel.z / hs);
    let fov = 50;
    switch (this.mode) {
      case 'chase': {
        const back = 1.5 * this.scale;
        this.wantEye.copy(focus).addScaledVector(this.heading, -back);
        this.wantEye.y += 0.5 * this.scale;
        this.wantEye.z += 0.25 * this.scale;
        this.wantTarget.copy(focus).addScaledVector(this.heading, 0.6 * this.scale);
        break;
      }
      case 'side': {
        const d = 1.9 * this.scale;
        this.wantEye.set(focus.x + 0.6 * this.scale, focus.y + 0.35 * this.scale, focus.z + d);
        this.wantTarget.set(focus.x + 0.6 * this.scale, focus.y, focus.z);
        fov = 45;
        break;
      }
      case 'thrower': {
        this.wantEye.set(launch.x - 0.9, launch.y + 0.15, launch.z + 0.45);
        this.wantTarget.copy(focus);
        const dist = this.wantEye.distanceTo(focus);
        // Zoom in as the plane flies away so it stays a readable size.
        fov = THREE.MathUtils.clamp((2 * Math.atan(1.6 / Math.max(dist, 0.1)) * 180) / Math.PI, 14, 55);
        break;
      }
      case 'orbit': {
        const ce = Math.cos(this.orbitEl);
        this.wantEye.set(
          focus.x - this.orbitDist * ce * Math.cos(this.orbitAz),
          focus.y + this.orbitDist * Math.sin(this.orbitEl),
          focus.z + this.orbitDist * ce * Math.sin(this.orbitAz),
        );
        this.wantTarget.copy(focus);
        break;
      }
    }
    this.keepInside(this.wantEye);
    const k = snap ? 1 : 1 - Math.exp(-dt * (this.mode === 'orbit' ? 14 : 4.5));
    const kt = snap ? 1 : 1 - Math.exp(-dt * 9);
    this.eye.lerp(this.wantEye, k);
    this.target.lerp(this.wantTarget, kt);
    this.fov += (fov - this.fov) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    const applied = (2 * Math.atan(Math.tan((this.fov * Math.PI) / 360) * this.fovScale) * 180) / Math.PI;
    if (Math.abs(applied - this.appliedFov) > 0.01) {
      this.appliedFov = applied;
      this.camera.fov = applied;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.target);
  }

  private keepInside(p: THREE.Vector3): void {
    const m = 0.25;
    const b = this.bounds;
    if (b) {
      p.x = THREE.MathUtils.clamp(p.x, b.xMin + m, b.xMax - m);
      p.z = THREE.MathUtils.clamp(p.z, b.zMin + m, b.zMax - m);
      p.y = THREE.MathUtils.clamp(p.y, 0.3, b.ceiling - m);
    } else {
      p.y = Math.max(p.y, this.groundAt(p.x) + 0.4);
    }
  }
}
