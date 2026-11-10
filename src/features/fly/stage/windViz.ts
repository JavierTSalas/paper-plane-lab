/**
 * Wind made visible: seeds and leaves carried by the same wind field the simulation flies in, and the
 * windsock's angle and droop.
 */
import * as THREE from 'three';
import { terrainHeight } from '../../../core/env';
import type { Environment, WindField } from '../../../core/types';
import { paint, seeded } from './geo';

const COUNT = 200;
/** Half sizes of the box of air around the focus point that holds the particles, metres. */
const HALF: readonly [number, number, number] = [22, 2.2, 16];
/** A windsock stands out fully at about 15 knots (7.7 m/s). */
const SOCK_FULL = 7.7;

export class WindParticles {
  readonly mesh: THREE.InstancedMesh;
  private readonly px = new Float32Array(COUNT);
  private readonly py = new Float32Array(COUNT);
  private readonly pz = new Float32Array(COUNT);
  private readonly spin = new Float32Array(COUNT);
  private readonly phase = new Float32Array(COUNT);
  private readonly o = new THREE.Object3D();
  private readonly w: [number, number, number] = [0, 0, 0];
  private readonly p: [number, number, number] = [0, 0, 0];
  private field: WindField | null = null;
  private env: Environment | null = null;
  private time = 0;

  constructor() {
    // A seed: a tiny flattened diamond. Leaves get a warmer colour through instance colours.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.05, 0.07, 0, 0, 0, 0.012, 0, 0, 0, -0.05, 0, 0.012, 0, -0.07, 0, 0, 0.07, 0, 0, 0, 0, 0.05, 0, 0.012, 0, 0, 0.012, 0, 0, 0, 0.05, -0.07, 0, 0], 3));
    geo.computeVertexNormals();
    paint(geo, '#ffffff');
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    this.mesh.frustumCulled = false;
    const rnd = seeded(5);
    const colors = ['#fffaf0', '#f4d77a', '#e8a76a', '#c9d98f'];
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      this.mesh.setColorAt(i, c.set(colors[i % colors.length]));
      this.spin[i] = 2 + rnd() * 5;
      this.phase[i] = rnd() * 10;
      this.px[i] = (rnd() * 2 - 1) * HALF[0];
      this.py[i] = rnd();
      this.pz[i] = (rnd() * 2 - 1) * HALF[2];
    }
    this.mesh.visible = false;
  }

  /** Particles positions are relative to the focus point, y as a fraction of the height band. */
  setField(field: WindField | null, env: Environment): void {
    this.field = field;
    this.env = env;
    this.mesh.visible = field !== null;
  }

  update(dt: number, fx: number, fz: number, reduced: boolean): void {
    const field = this.field;
    const env = this.env;
    if (!field || !env) return;
    this.time += dt;
    const step = reduced ? dt * 0.5 : dt;
    for (let i = 0; i < COUNT; i++) {
      let x = this.px[i];
      let z = this.pz[i];
      const wx = fx + x;
      const wz = fz + z;
      const ground = terrainHeight(env.terrain, wx);
      const h = 0.3 + this.py[i] * HALF[1] * 2;
      this.p[0] = wx;
      this.p[1] = ground + h;
      this.p[2] = wz;
      field.mean(this.p, this.time, this.w);
      const ph = this.phase[i] + this.time * this.spin[i];
      x += (this.w[0] + 0.15 * Math.sin(ph)) * step;
      z += (this.w[2] + 0.15 * Math.cos(ph * 0.8)) * step;
      this.py[i] = Math.min(1, Math.max(0, this.py[i] + (this.w[1] * 0.3 + 0.05 * Math.sin(ph * 0.6)) * step / (HALF[1] * 2)));
      // Wrap around the box so the air around the camera stays full.
      if (x > HALF[0]) x -= 2 * HALF[0];
      else if (x < -HALF[0]) x += 2 * HALF[0];
      if (z > HALF[2]) z -= 2 * HALF[2];
      else if (z < -HALF[2]) z += 2 * HALF[2];
      this.px[i] = x;
      this.pz[i] = z;
      this.o.position.set(fx + x, ground + h, fz + z);
      this.o.rotation.set(ph, ph * 0.7, 0);
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** Point the sock downwind and let it droop in light air. `wx`, `wz` = horizontal wind at the sock. */
export function poseWindsock(pivot: THREE.Object3D, wx: number, wz: number, time: number, reduced: boolean): void {
  const speed = Math.hypot(wx, wz);
  const full = Math.min(1, speed / SOCK_FULL);
  const flutter = reduced ? 0 : Math.sin(time * (3 + speed)) * 0.05 * full;
  if (speed > 0.05) pivot.rotation.y = Math.atan2(-wz, wx) + flutter;
  // Hanging straight down in calm air (85 degrees) to level at full strength.
  pivot.rotation.z = -(1 - full) * 1.48 + flutter * 0.5;
}
