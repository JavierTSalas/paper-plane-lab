/**
 * The six places, built from painted low-poly primitives. Sizes come from the physical environment
 * (room bounds, terrain), so what you see is exactly what the plane can hit.
 */
import * as THREE from 'three';
import { cliffTopHeight, terrainHeight } from '../../../core/env';
import type { Environment, RoomBounds, Terrain } from '../../../core/types';
import { blob, box, cone, cylinder, lin, merge, numeral, onGround, paint, quad, seeded } from './geo';

export interface Scenery {
  group: THREE.Group;
  sky: THREE.Color;
  fogNear: number;
  fogFar: number;
  /** Clouds and gulls: animated by `tick`. */
  tick(dt: number, time: number, windX: number, windZ: number): void;
  /** Windsock pivot (top of the pole) or null indoors. */
  sock: THREE.Object3D | null;
  dispose(): void;
}

export const PALETTE = {
  ink: '#2f2e2b',
  paper: '#f7f1e5',
  card: '#fffaf0',
  accent: '#d9694c',
  mustard: '#e3b04b',
  sage: '#7fa58a',
  sky: '#7fb2d9',
  wood: ['#c99a68', '#bd8d5c', '#d3a777'],
  grass: '#9fc27c',
  grassDark: '#86ad6b',
  leaf: ['#6f9a68', '#7fa873', '#8fb47a'],
  trunk: '#8a6440',
  rock: '#b8a48b',
  rockDark: '#9a8670',
  sea: '#6ea9c9',
  cloud: '#fffaf0',
} as const;

type V3 = readonly [number, number, number];

/** A quad with the given normal: corners are reordered if needed. */
function rect(a: V3, b: V3, c: V3, d: V3, normal: V3, color: string | THREE.Color): THREE.BufferGeometry {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const dot = n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2];
  return dot >= 0 ? quad(a, b, c, d, color) : quad(a, d, c, b, color);
}

/** Axis-aligned flat rectangle on the floor (y), facing up. */
function floorRect(x0: number, x1: number, z0: number, z1: number, y: number, color: string | THREE.Color): THREE.BufferGeometry {
  return rect([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], color);
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

/** One instanced mesh of `geo` at the given transforms [x, y, z, rotY, scale]. */
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, at: readonly (readonly [number, number, number, number, number])[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, at.length));
  const o = new THREE.Object3D();
  at.forEach(([x, y, z, r, s], i) => {
    o.position.set(x, y, z);
    o.rotation.set(0, r, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.count = at.length;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

/* ------------------------------------------------------------------ rooms */

interface RoomColors {
  floor: readonly string[];
  plankWidth: number;
  wall: string;
  wallLow: string;
  ceiling: string;
}

/** Floor of planks running downrange, four inward-facing walls and a ceiling. */
function roomShell(b: RoomBounds, c: RoomColors): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const { xMin, xMax, zMin, zMax, ceiling: h } = b;
  let i = 0;
  for (let z = zMin; z < zMax - 1e-6; z += c.plankWidth, i++) {
    const z1 = Math.min(zMax, z + c.plankWidth);
    parts.push(floorRect(xMin, xMax, z, z1, 0, c.floor[(i * 7) % c.floor.length]));
  }
  const dado = Math.min(1.1, h * 0.3);
  const wall = (x0: number, z0: number, x1: number, z1: number, n: V3): void => {
    parts.push(rect([x0, 0, z0], [x1, 0, z1], [x1, dado, z1], [x0, dado, z0], n, c.wallLow));
    parts.push(rect([x0, dado, z0], [x1, dado, z1], [x1, h, z1], [x0, h, z0], n, c.wall));
  };
  wall(xMin, zMin, xMin, zMax, [1, 0, 0]);
  wall(xMax, zMin, xMax, zMax, [-1, 0, 0]);
  wall(xMin, zMin, xMax, zMin, [0, 0, 1]);
  wall(xMin, zMax, xMax, zMax, [0, 0, -1]);
  parts.push(rect([xMin, h, zMin], [xMax, h, zMin], [xMax, h, zMax], [xMin, h, zMax], [0, -1, 0], c.ceiling));
  return merge(parts);
}

/** Window in a side wall at z = zWall (glass toward the room), centre x, bottom y, size w x h. */
function windowParts(zWall: number, inward: 1 | -1, x: number, y: number, w: number, h: number, parts: THREE.BufferGeometry[]): void {
  const z = zWall + inward * 0.01;
  const frame = 0.06;
  parts.push(rect([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z], [0, 0, inward], '#cfe6f2'));
  // A pale sky gradient band and the frame bars.
  parts.push(rect([x - w / 2, y + h * 0.55, z + inward * 0.002], [x + w / 2, y + h * 0.55, z + inward * 0.002], [x + w / 2, y + h, z + inward * 0.002], [x - w / 2, y + h, z + inward * 0.002], [0, 0, inward], '#e4f1f7'));
  const zf = zWall + inward * 0.03;
  parts.push(box(w + frame * 2, frame, 0.06, PALETTE.card, x, y, zf));
  parts.push(box(w + frame * 2, frame, 0.06, PALETTE.card, x, y + h, zf));
  parts.push(box(frame, h, 0.06, PALETTE.card, x - w / 2, y + h / 2, zf));
  parts.push(box(frame, h, 0.06, PALETTE.card, x + w / 2, y + h / 2, zf));
  parts.push(box(frame * 0.7, h, 0.05, PALETTE.card, x, y + h / 2, zf));
  parts.push(box(w, frame * 0.7, 0.05, PALETTE.card, x, y + h * 0.55, zf));
  parts.push(box(w + 0.2, 0.04, 0.16, '#d9c3a0', x, y - 0.02, zWall + inward * 0.08));
}

function classroom(env: Environment, mat: THREE.Material): Scenery {
  const b = env.bounds as RoomBounds;
  const group = new THREE.Group();
  group.add(mesh(roomShell(b, { floor: PALETTE.wood, plankWidth: 0.16, wall: '#f1e3c8', wallLow: '#d9c3a0', ceiling: '#f7f1e5' }), mat));

  const parts: THREE.BufferGeometry[] = [];
  // Blackboard on the far wall, with chalk tray and a chalk paper plane.
  const xb = b.xMax - 0.02;
  parts.push(box(0.04, 1.3, 3.8, '#8a6440', xb, 1.55, 0));
  parts.push(box(0.05, 1.18, 3.66, '#3f5a4c', xb - 0.01, 1.55, 0));
  parts.push(box(0.12, 0.03, 3.7, '#8a6440', xb - 0.06, 0.92, 0));
  const chalk = '#e8efe6';
  parts.push(box(0.01, 0.02, 0.9, chalk, xb - 0.04, 1.78, -0.9, 0));
  const doodle: [number, number, number, number][] = [
    [1.55, -1.3, 1.85, -0.6],
    [1.85, -0.6, 1.62, -0.75],
    [1.62, -0.75, 1.55, -1.3],
  ];
  for (const [y0, z0, y1, z1] of doodle) {
    const len = Math.hypot(y1 - y0, z1 - z0);
    const g = box(0.01, 0.025, len, chalk);
    g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
    g.translate(xb - 0.04, (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(g);
  }
  // Wall clock above the board.
  const clock = cylinder(0.2, 0.2, 0.04, 16, PALETTE.card);
  clock.rotateZ(Math.PI / 2);
  clock.translate(xb - 0.03, 2.55, 1.5);
  parts.push(clock);
  parts.push(box(0.01, 0.13, 0.02, PALETTE.ink, xb - 0.06, 2.6, 1.5));
  parts.push(box(0.01, 0.02, 0.1, PALETTE.ink, xb - 0.06, 2.55, 1.54));
  // Windows on the left wall, a door and a pin board on the right.
  for (let x = 0.2; x < b.xMax - 0.8; x += 2.3) windowParts(b.zMin, 1, x + 0.6, 1.0, 1.5, 1.5, parts);
  parts.push(box(1, 2.1, 0.05, '#b98a5a', b.xMin + 1.4, 1.05, b.zMax - 0.03));
  parts.push(box(1.6, 1, 0.03, '#c9a877', 3.5, 1.6, b.zMax - 0.02));
  const pins = ['#e39aa0', '#7fb2d9', '#e3b04b', '#fffaf0'];
  for (let i = 0; i < 6; i++) parts.push(box(0.3, 0.22, 0.01, pins[i % 4], 2.95 + (i % 3) * 0.55, 1.4 + Math.floor(i / 3) * 0.42, b.zMax - 0.04));
  // Ceiling lights.
  for (let x = 0.5; x < b.xMax; x += 3) for (const z of [-1.5, 1.5]) parts.push(box(1.2, 0.04, 0.3, '#fffdf4', x, b.ceiling - 0.03, z));
  // Teacher's desk in the front corner.
  parts.push(box(1.4, 0.05, 0.7, '#b07f4f', b.xMax - 1.3, 0.76, b.zMax - 0.8));
  parts.push(box(1.3, 0.7, 0.04, '#9b6d42', b.xMax - 1.3, 0.38, b.zMax - 1.13));
  parts.push(box(0.2, 0.25, 0.15, '#7fa58a', b.xMax - 1.6, 0.92, b.zMax - 0.7));
  group.add(mesh(merge(parts), mat));

  // Desks and chairs pushed against the side walls.
  const desk = merge([
    box(1.1, 0.04, 0.55, '#d8b27f', 0, 0.72, 0),
    box(0.04, 0.7, 0.04, '#6b665c', -0.5, 0.35, -0.23),
    box(0.04, 0.7, 0.04, '#6b665c', 0.5, 0.35, -0.23),
    box(0.04, 0.7, 0.04, '#6b665c', -0.5, 0.35, 0.23),
    box(0.04, 0.7, 0.04, '#6b665c', 0.5, 0.35, 0.23),
    box(1.0, 0.12, 0.5, '#c9a46f', 0, 0.62, 0),
  ]);
  const chair = merge([
    box(0.42, 0.04, 0.4, '#7fa58a', 0, 0.44, 0),
    box(0.42, 0.36, 0.04, '#7fa58a', 0, 0.68, 0.2),
    box(0.03, 0.44, 0.03, '#6b665c', -0.18, 0.22, -0.17),
    box(0.03, 0.44, 0.03, '#6b665c', 0.18, 0.22, -0.17),
    box(0.03, 0.44, 0.03, '#6b665c', -0.18, 0.22, 0.17),
    box(0.03, 0.44, 0.03, '#6b665c', 0.18, 0.22, 0.17),
  ]);
  const desks: [number, number, number, number, number][] = [];
  const chairs: [number, number, number, number, number][] = [];
  for (let x = 0.4; x < b.xMax - 2.2; x += 1.3) {
    desks.push([x, 0, b.zMin + 0.45, 0, 1], [x, 0, b.zMax - 0.45, 0, 1]);
    chairs.push([x, 0, b.zMin + 1.05, Math.PI, 1], [x + 0.1, 0, b.zMax - 1.05, 0, 1]);
  }
  group.add(instanced(desk, mat, desks), instanced(chair, mat, chairs));
  return staticScenery(group, '#efe2c8', 30, 60);
}

function gym(env: Environment, mat: THREE.Material): Scenery {
  const b = env.bounds as RoomBounds;
  const group = new THREE.Group();
  group.add(mesh(roomShell(b, { floor: ['#e2b67f', '#d9ab74', '#e8bf8a'], plankWidth: 0.5, wall: '#eadcc0', wallLow: '#8fb4d6', ceiling: '#d8ccb6' }), mat));
  const parts: THREE.BufferGeometry[] = [];
  // Basketball court: 28 x 15 m centred in the hall.
  const cx = (b.xMin + b.xMax) / 2;
  const L = Math.min(28, b.xMax - b.xMin - 4);
  const W = Math.min(15, b.zMax - b.zMin - 6);
  const y = 0.004;
  const lw = 0.06;
  const line = (x0: number, z0: number, x1: number, z1: number, color: string = PALETTE.card): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = paint(new THREE.PlaneGeometry(len, lw).rotateX(-Math.PI / 2), color);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    parts.push(g);
  };
  line(cx - L / 2, -W / 2, cx + L / 2, -W / 2);
  line(cx - L / 2, W / 2, cx + L / 2, W / 2);
  line(cx - L / 2, -W / 2, cx - L / 2, W / 2);
  line(cx + L / 2, -W / 2, cx + L / 2, W / 2);
  line(cx, -W / 2, cx, W / 2);
  const ring = (x: number, r: number, a0 = 0, a1 = Math.PI * 2, color: string = PALETTE.card): void => {
    const n = 28;
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      line(x + r * Math.cos(t0), r * Math.sin(t0), x + r * Math.cos(t1), r * Math.sin(t1), color);
    }
  };
  ring(cx, 1.8);
  for (const s of [-1, 1] as const) {
    const xe = cx + s * (L / 2);
    // Painted key and three-point arc.
    const key = floorRect(Math.min(xe, xe - s * 5.8), Math.max(xe, xe - s * 5.8), -2.45, 2.45, 0.003, '#d9805f');
    parts.push(key);
    ring(xe - s * 5.8, 1.8, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? (3 * Math.PI) / 2 : Math.PI / 2);
    ring(xe - s * 1.575, 6.75, s > 0 ? Math.PI * 0.6 : -Math.PI * 0.4, s > 0 ? Math.PI * 1.4 : Math.PI * 0.4);
  }
  // Practice hoops on the left wall, clear of the throw line (the simulation only knows the walls).
  for (const x of [cx - 7, cx + 7]) {
    const zw = b.zMin;
    parts.push(box(0.12, 0.12, 1.1, '#6b665c', x, 3.35, zw + 0.55));
    parts.push(box(1.8, 1.05, 0.05, PALETTE.card, x, 3.4, zw + 1.1));
    parts.push(box(0.6, 0.45, 0.06, PALETTE.accent, x, 3.25, zw + 1.08));
    const rim = paint(new THREE.TorusGeometry(0.23, 0.02, 4, 14).rotateX(Math.PI / 2), PALETTE.accent);
    rim.translate(x, 3.05, zw + 1.38);
    parts.push(rim);
  }
  // Bleachers along the right wall: five stepped tiers.
  for (let k = 0; k < 5; k++) {
    const depth = 0.75;
    const z = b.zMax - 0.4 - depth * (4 - k) - depth / 2;
    parts.push(box(b.xMax - b.xMin - 10, 0.42 * (k + 1), depth, k % 2 ? '#d9c9a8' : '#cdb994', cx, 0.21 * (k + 1), z));
    parts.push(box(b.xMax - b.xMin - 10, 0.06, 0.3, k % 2 ? '#7fb2d9' : '#6fa0c8', cx, 0.42 * (k + 1) + 0.03, z - 0.1));
  }
  // High windows on the left wall, roof trusses and lights.
  for (let x = b.xMin + 3; x < b.xMax - 3; x += 4.5) windowParts(b.zMin, 1, x, b.ceiling - 2.6, 3.2, 1.6, parts);
  for (let x = b.xMin + 4; x < b.xMax; x += 6) {
    parts.push(box(0.25, 0.5, b.zMax - b.zMin, '#9b958a', x, b.ceiling - 0.3, 0));
    for (const z of [-6, 0, 6]) parts.push(box(0.6, 0.15, 0.6, '#fffdf4', x + 3, b.ceiling - 0.6, z));
  }
  // A banner and a scoreboard on the far wall.
  parts.push(box(0.1, 1.4, 4, PALETTE.ink, b.xMax - 0.06, 5.2, 0));
  parts.push(box(0.11, 0.5, 1.2, PALETTE.accent, b.xMax - 0.08, 5.2, -1));
  parts.push(box(0.11, 0.5, 1.2, PALETTE.sky, b.xMax - 0.08, 5.2, 1));
  group.add(mesh(merge(parts), mat));
  return staticScenery(group, '#efe2c8', 60, 140);
}

function hangar(env: Environment, mat: THREE.Material): Scenery {
  const b = env.bounds as RoomBounds;
  const group = new THREE.Group();
  group.add(mesh(roomShell(b, { floor: ['#cfc8b8', '#c9c1b0', '#d4ccbd'], plankWidth: 10, wall: '#c9c2b0', wallLow: '#a9a08f', ceiling: '#8f897c' }), mat));
  const parts: THREE.BufferGeometry[] = [];
  // Distance stripes every 5 m across the floor, with numbers every 10 m.
  for (let x = 0; x <= b.xMax - 1; x += 5) {
    const major = x % 10 === 0;
    parts.push(floorRect(x - (major ? 0.12 : 0.07), x + (major ? 0.12 : 0.07), major ? -14 : -9, major ? 14 : 9, 0.004, major ? PALETTE.mustard : '#e9c97f'));
    if (major && x > 0) {
      parts.push(numeral(String(x), 1.8, PALETTE.ink, onGround(x + 1.4, 0.006, -11)));
      parts.push(numeral(String(x), 1.8, PALETTE.ink, onGround(x + 1.4, 0.006, 11)));
    }
  }
  // Slab joints.
  for (let z = -20; z <= 20; z += 10) parts.push(floorRect(b.xMin, b.xMax, z - 0.02, z + 0.02, 0.002, '#b7af9e'));
  // Pilasters and roof trusses every 10 m.
  for (let x = b.xMin + 5; x < b.xMax; x += 10) {
    for (const s of [-1, 1] as const) parts.push(box(0.8, b.ceiling, 0.6, '#9e9686', x, b.ceiling / 2, s * (b.zMax - 0.3)));
    parts.push(box(0.5, 1.6, b.zMax - b.zMin, '#7d776b', x, b.ceiling - 0.8, 0));
    parts.push(box(0.3, 0.3, b.zMax - b.zMin, '#7d776b', x, b.ceiling - 2.4, 0));
    for (const z of [-18, 0, 18]) {
      parts.push(cylinder(0.02, 0.02, 4, 4, PALETTE.ink, x, b.ceiling - 4, z));
      parts.push(cylinder(0.6, 0.9, 0.5, 8, '#fff6dc', x, b.ceiling - 6.2, z));
    }
  }
  // Clerestory windows high on both side walls.
  for (let x = b.xMin + 10; x < b.xMax - 5; x += 10) {
    windowParts(b.zMin, 1, x, b.ceiling - 6, 7, 3.4, parts);
    windowParts(b.zMax, -1, x, b.ceiling - 6, 7, 3.4, parts);
  }
  // Big doors at the far end.
  for (let z = -24; z < 24; z += 8) {
    parts.push(box(0.3, 16, 7.8, z % 16 === 0 ? '#b9c6c9' : '#aebcbf', b.xMax - 0.2, 8, z + 4));
    parts.push(box(0.32, 0.4, 7.8, '#e3b04b', b.xMax - 0.2, 16.2, z + 4));
  }
  parts.push(box(0.4, 0.3, 50, PALETTE.ink, b.xMax - 0.3, 16.6, 0));
  // Crates and a workbench near the back wall.
  parts.push(box(1.2, 1.2, 1.2, '#c9a877', b.xMin + 1.2, 0.6, b.zMin + 3));
  parts.push(box(1, 1, 1, '#b9935f', b.xMin + 1.2, 1.7, b.zMin + 3.1, 0.3));
  parts.push(box(1.2, 1.2, 1.2, '#c9a877', b.xMin + 2.6, 0.6, b.zMin + 3.4, 0.2));
  parts.push(box(3, 0.9, 1, '#8a6440', 6, 0.45, b.zMax - 2));
  // Record banner high on the far wall.
  parts.push(box(0.2, 2.4, 22, PALETTE.accent, b.xMax - 0.5, 19.5, 0));
  parts.push(numeral('98', 1.6, PALETTE.card, (u, v) => [b.xMax - 0.62, 19.5 + v, u - 7]));
  parts.push(numeral('43', 1.6, PALETTE.card, (u, v) => [b.xMax - 0.62, 19.5 + v, u - 3]));
  parts.push(box(0.1, 0.25, 0.25, PALETTE.card, b.xMax - 0.62, 18.8, -5));
  group.add(mesh(merge(parts), mat));
  return staticScenery(group, '#ded6c4', 70, 220);
}

function staticScenery(group: THREE.Group, sky: string, fogNear: number, fogFar: number): Scenery {
  return {
    group,
    sky: lin(sky),
    fogNear,
    fogFar,
    sock: null,
    tick: () => undefined,
    dispose: () => disposeTree(group),
  };
}

/* ------------------------------------------------------------------ outdoors */

/** Ground mesh over the terrain on the given x and z lines, faceted, coloured by `paintAt`. */
function terrainMesh(
  terrain: Terrain,
  xs: readonly number[],
  zs: readonly number[],
  paintAt: (x: number, y: number, slope: number, rnd: () => number) => THREE.Color,
  rnd: () => number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const hy = xs.map((x) => terrainHeight(terrain, x));
  const push = (i: number, j: number): void => {
    pos.push(xs[i], hy[i], zs[j]);
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    const slope = Math.abs((hy[i + 1] - hy[i]) / (xs[i + 1] - xs[i]));
    for (let j = 0; j + 1 < zs.length; j++) {
      // Two triangles per cell, counter-clockwise from above.
      push(i, j);
      push(i, j + 1);
      push(i + 1, j + 1);
      push(i, j);
      push(i + 1, j + 1);
      push(i + 1, j);
      for (let t = 0; t < 2; t++) {
        const c = paintAt((xs[i] + xs[i + 1]) / 2, (hy[i] + hy[i + 1]) / 2, slope, rnd);
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let x = from; x < to; x += step) out.push(x);
  out.push(to);
  return out;
}

function skyDome(top: string, horizon: string): THREE.Mesh {
  const g = new THREE.SphereGeometry(1500, 24, 12);
  const p = g.getAttribute('position');
  const cols = new Float32Array(p.count * 3);
  const a = lin(top);
  const h = lin(horizon);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, p.getY(i) / 700));
    c.copy(h).lerp(a, Math.pow(t, 0.6));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  return m;
}

function treeGeometry(rnd: () => number): THREE.BufferGeometry {
  return merge([
    cylinder(0.12, 0.18, 1.4, 5, PALETTE.trunk, 0, 0.7, 0),
    cone(1.3, 2.2, 6, PALETTE.leaf[0], 0, 2.2, 0, 0.08, rnd),
    cone(1.0, 1.8, 6, PALETTE.leaf[1], 0, 3.2, 0, 0.08, rnd),
    cone(0.65, 1.3, 6, PALETTE.leaf[2], 0, 4.0, 0, 0.08, rnd),
  ]);
}

function roundTreeGeometry(rnd: () => number): THREE.BufferGeometry {
  return merge([cylinder(0.14, 0.2, 1.6, 5, PALETTE.trunk, 0, 0.8, 0), blob(1.3, 0, PALETTE.leaf[1], 1, 0.9, 1, 0, 2.4, 0, 0.1, rnd)]);
}

function cloudGeometry(rnd: () => number): THREE.BufferGeometry {
  const n = 3 + Math.floor(rnd() * 3);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const r = 4 + rnd() * 5;
    parts.push(blob(r, 0, PALETTE.cloud, 1.4, 0.7, 1, (i - n / 2) * 6 + rnd() * 3, rnd() * 2, rnd() * 4, 0.04, rnd));
  }
  return merge(parts);
}

/** Pole and a striped sock pointing along its local +x; the pivot is the top of the pole. */
function windsock(x: number, y: number, z: number, mat: THREE.Material): { pole: THREE.Mesh; pivot: THREE.Group } {
  const pole = mesh(merge([cylinder(0.04, 0.05, 3.2, 6, '#6b665c', x, y + 1.6, z), cylinder(0.07, 0.07, 0.08, 6, PALETTE.ink, x, y + 3.2, z)]), mat);
  const parts: THREE.BufferGeometry[] = [];
  const seg = 5;
  for (let i = 0; i < seg; i++) {
    const r0 = 0.24 - i * 0.03;
    const r1 = 0.24 - (i + 1) * 0.03;
    const g = cylinder(r1, r0, 0.28, 8, i % 2 ? '#fffaf0' : '#e8724f');
    g.rotateZ(-Math.PI / 2);
    g.translate(0.14 + i * 0.28 + 0.06, 0, 0);
    parts.push(g);
  }
  parts.push(box(0.08, 0.02, 0.5, '#6b665c', 0.04, 0, 0));
  const sock = new THREE.Mesh(merge(parts), mat);
  const pivot = new THREE.Group();
  pivot.position.set(x, y + 3.15, z);
  pivot.rotation.order = 'YZX';
  pivot.add(sock);
  return { pole, pivot };
}

interface Drifter {
  obj: THREE.Object3D;
  speed: number;
}

function outdoor(
  _env: Environment,
  mat: THREE.Material,
  opts: { ground: THREE.BufferGeometry; extra: THREE.BufferGeometry[]; trees: [number, number, number, number, number][]; roundTrees: [number, number, number, number, number][]; sockAt: V3; skyTop: string; horizon: string; gulls: boolean; seaY?: number },
  rnd: () => number,
): Scenery {
  const group = new THREE.Group();
  group.add(skyDome(opts.skyTop, opts.horizon));
  group.add(mesh(opts.ground, mat));
  if (opts.extra.length) group.add(mesh(merge(opts.extra), mat));
  if (opts.trees.length) group.add(instanced(treeGeometry(rnd), mat, opts.trees));
  if (opts.roundTrees.length) group.add(instanced(roundTreeGeometry(rnd), mat, opts.roundTrees));
  const sock = windsock(opts.sockAt[0], opts.sockAt[1], opts.sockAt[2], mat);
  group.add(sock.pole, sock.pivot);

  const clouds: Drifter[] = [];
  // Clouds glow a little so their undersides stay white instead of catching the ground light.
  const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xe8e2d6, emissiveIntensity: 0.55 });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(cloudGeometry(rnd), cloudMat);
    c.position.set(-300 + rnd() * 700, 120 + rnd() * 80, -350 + rnd() * 700);
    c.scale.setScalar(1.6 + rnd());
    group.add(c);
    clouds.push({ obj: c, speed: 0.6 + rnd() * 0.5 });
  }
  const gulls: { obj: THREE.Object3D; cx: number; cy: number; cz: number; r: number; w: number; ph: number }[] = [];
  if (opts.gulls) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.15, 0.02, -0.5, 0.1, 0, 0, 0, 0, 0, 0.1, 0, 0, -0.15, 0.02, 0.5], 3));
    g.computeVertexNormals();
    const gull = paint(g, PALETTE.card);
    const gm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const o = new THREE.Mesh(gull, gm);
      o.scale.setScalar(1.4);
      group.add(o);
      gulls.push({ obj: o, cx: 20 + rnd() * 50, cy: (opts.seaY ?? 0) + 18 + rnd() * 20, cz: -20 + rnd() * 40, r: 6 + rnd() * 10, w: 0.15 + rnd() * 0.15, ph: rnd() * 6 });
    }
  }

  return {
    group,
    sky: lin(opts.horizon),
    fogNear: 120,
    fogFar: 900,
    sock: sock.pivot,
    tick(dt, time, windX, windZ) {
      for (const c of clouds) {
        c.obj.position.x += (windX * 2 + 0.6) * c.speed * dt;
        c.obj.position.z += windZ * 2 * c.speed * dt;
        if (c.obj.position.x > 420) c.obj.position.x -= 800;
        if (c.obj.position.x < -380) c.obj.position.x += 800;
        if (c.obj.position.z > 400) c.obj.position.z -= 800;
        if (c.obj.position.z < -400) c.obj.position.z += 800;
      }
      for (const g of gulls) {
        const a = g.ph + time * g.w;
        g.obj.position.set(g.cx + g.r * Math.cos(a), g.cy + Math.sin(time * 0.7 + g.ph) * 1.5, g.cz + g.r * Math.sin(a));
        g.obj.rotation.set(0, -a, 0);
        g.obj.scale.set(1.4, 1.4 * (1 + 0.6 * Math.sin(time * 6 + g.ph)), 1.4);
      }
    },
    dispose: () => disposeTree(group),
  };
}

const grassColor = (base: string, var2: string) => {
  const a = lin(base);
  const b2 = lin(var2);
  const c = new THREE.Color();
  return (_x: number, _y: number, slope: number, rnd: () => number): THREE.Color => {
    c.copy(a).lerp(b2, rnd() * 0.7);
    if (slope > 0.6) c.lerp(lin(PALETTE.rock), Math.min(1, (slope - 0.6) * 1.5));
    return c.multiplyScalar(0.96 + rnd() * 0.08);
  };
};

/** Scatter trees outside the throw corridor (|z| < corridor for x in front of the thrower). */
function scatter(
  rnd: () => number,
  n: number,
  xr: [number, number],
  zr: [number, number],
  corridor: number,
  ground: (x: number) => number,
  ok: (x: number) => boolean = () => true,
): [number, number, number, number, number][] {
  const out: [number, number, number, number, number][] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 20) {
    const x = xr[0] + rnd() * (xr[1] - xr[0]);
    const z = zr[0] + rnd() * (zr[1] - zr[0]);
    if (Math.abs(z) < corridor && x > -12) continue;
    if (!ok(x)) continue;
    out.push([x, ground(x) - 0.1, z, rnd() * Math.PI * 2, 0.7 + rnd() * 0.7]);
  }
  return out;
}

function grassTufts(rnd: () => number, n: number, xr: [number, number], zr: number, ground: (x: number) => number, ok: (x: number) => boolean = () => true): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const x = xr[0] + rnd() * (xr[1] - xr[0]);
    const z = (rnd() * 2 - 1) * zr;
    // Keep the strip along the throw line clear: low cameras fly there.
    if (!ok(x) || Math.abs(z) < 3) continue;
    const flower = rnd() < 0.15;
    parts.push(cone(0.08 + rnd() * 0.06, 0.25 + rnd() * 0.2, 3, flower ? (rnd() < 0.5 ? '#f4d77a' : PALETTE.card) : PALETTE.grassDark, x, ground(x) + 0.1, z));
  }
  return parts;
}

function meadow(env: Environment, mat: THREE.Material): Scenery {
  const rnd = seeded(11);
  const t = env.terrain;
  const xs = range(-320, 420, 10);
  const zs = range(-360, 360, 12);
  const ground = terrainMesh(t, xs, zs, grassColor(PALETTE.grass, '#b3cd86'), rnd);
  const extra: THREE.BufferGeometry[] = grassTufts(rnd, 500, [-10, 90], 25, () => 0);
  // Rolling hills on the horizon.
  for (let i = 0; i < 14; i++) {
    const a = -1.2 + (i / 13) * 2.4;
    const r = 380 + rnd() * 120;
    const col = i % 2 ? '#a9c48c' : '#b8cf98';
    extra.push(blob(60 + rnd() * 50, 1, col, 1.6, 0.35 + rnd() * 0.2, 1.2, Math.cos(a) * r, -6, Math.sin(a) * r, 0.03, rnd));
  }
  // A picnic blanket and basket by the thrower.
  extra.push(box(1.4, 0.02, 1.1, '#e39aa0', -1.6, 0.01, 1.6, 0.3));
  extra.push(box(0.4, 0.25, 0.3, '#c9a877', -1.4, 0.13, 1.8, 0.4));
  const trees = scatter(rnd, 40, [-60, 160], [-90, 90], 18, () => 0);
  const roundTrees = scatter(rnd, 25, [-60, 160], [-90, 90], 18, () => 0);
  return outdoor(env, mat, { ground, extra, trees, roundTrees, sockAt: [7, 0, -10], skyTop: '#8cc1e3', horizon: '#f2ead8', gulls: false }, rnd);
}

function hill(env: Environment, mat: THREE.Material): Scenery {
  const rnd = seeded(23);
  const t = env.terrain;
  const xs = range(-260, 320, 4);
  const zs = range(-220, 220, 10);
  const ground = terrainMesh(t, xs, zs, grassColor('#a3c47f', '#8db56e'), rnd);
  const g = (x: number): number => terrainHeight(t, x);
  const extra: THREE.BufferGeometry[] = grassTufts(rnd, 400, [-30, 60], 25, g);
  // A bench and a cairn on the crest.
  if (t.kind === 'hill') {
    const cx = t.crestX;
    extra.push(box(1.6, 0.06, 0.45, '#8a6440', cx, g(cx) + 0.45, 6));
    extra.push(box(0.08, 0.45, 0.4, '#6b665c', cx - 0.7, g(cx) + 0.22, 6));
    extra.push(box(0.08, 0.45, 0.4, '#6b665c', cx + 0.7, g(cx) + 0.22, 6));
    extra.push(blob(0.6, 0, PALETTE.rock, 1, 0.6, 1, cx - 3, g(cx - 3) + 0.2, -7));
    extra.push(blob(0.4, 0, PALETTE.rockDark, 1, 0.8, 1, cx - 3, g(cx - 3) + 0.7, -7));
  }
  for (let i = 0; i < 10; i++) {
    const a = -1.1 + (i / 9) * 2.2;
    extra.push(blob(80 + rnd() * 40, 1, i % 2 ? '#a7bfa0' : '#b9cdb0', 1.5, 0.45, 1.2, Math.cos(a) * 520, -30, Math.sin(a) * 520, 0.03, rnd));
  }
  const trees = scatter(rnd, 50, [-200, 260], [-160, 160], 20, g);
  const roundTrees = scatter(rnd, 30, [-200, 260], [-160, 160], 20, g);
  return outdoor(env, mat, { ground, extra, trees, roundTrees, sockAt: [7, g(7), -10], skyTop: '#86bde2', horizon: '#eef0e2', gulls: false }, rnd);
}

function cliff(env: Environment, mat: THREE.Material): Scenery {
  const rnd = seeded(37);
  const t = env.terrain;
  if (t.kind !== 'cliff') return meadow(env, mat);
  const top = cliffTopHeight(t);
  const seaY = top - t.height;
  // Fine lines along the rounded face (quarter circle), coarse on the top.
  const face: number[] = [];
  for (let i = 0; i <= 24; i++) face.push(t.edgeX + t.height * Math.sin((i / 24) * (Math.PI / 2)));
  const xs = [...range(-260, t.edgeX - 6, 6).slice(0, -1), ...range(t.edgeX - 6, t.edgeX, 1).slice(0, -1), ...face];
  const zs = range(-220, 220, 8);
  const rock = lin(PALETTE.rock);
  const rockDark = lin(PALETTE.rockDark);
  const grass = grassColor('#a7c482', '#93b672');
  const c = new THREE.Color();
  const ground = terrainMesh(t, xs, zs, (x, y, slope, r) => {
    if (slope < 0.5) return grass(x, y, slope, r);
    return c.copy(rock).lerp(rockDark, r() * 0.6 + Math.min(0.4, (top - y) / t.height) * 0.5);
  }, rnd);
  const g = (x: number): number => terrainHeight(t, x);
  const extra: THREE.BufferGeometry[] = grassTufts(rnd, 300, [-40, t.edgeX + t.height * 0.4], 25, g, (x) => x < t.edgeX + t.height * 0.4);
  // The sea, a strip of foam at the foot and rocks in the surf.
  extra.push(floorRect(t.edgeX + t.height * 0.9, 1400, -1400, 1400, seaY + 0.02, PALETTE.sea));
  extra.push(floorRect(t.edgeX + t.height - 0.2, t.edgeX + t.height + 2.5, -220, 220, seaY + 0.06, '#e6f2f2'));
  for (let i = 0; i < 26; i++) {
    const x = t.edgeX + t.height + 1 + rnd() * 10;
    extra.push(blob(1 + rnd() * 2.5, 0, rnd() < 0.5 ? PALETTE.rock : PALETTE.rockDark, 1, 0.7, 1, x, seaY, -200 + rnd() * 400, 0.05, rnd));
  }
  // Distance buoys every 10 m on the sea, and a lighthouse on a far headland.
  for (let x = 30; x <= 150; x += 10) {
    if (x < t.edgeX + t.height + 3) continue;
    extra.push(cylinder(0.5, 0.7, 1, 8, x % 50 === 0 ? PALETTE.accent : PALETTE.mustard, x, seaY + 0.4, -3));
  }
  extra.push(blob(60, 1, '#a7bf92', 1.2, 0.6, 1, 260, seaY - 6, -320, 0.04, rnd));
  extra.push(cylinder(2.2, 3, 22, 10, PALETTE.card, 255, seaY + 34, -300));
  extra.push(cylinder(2.3, 2.3, 4, 10, PALETTE.accent, 255, seaY + 30, -300));
  extra.push(cylinder(2.6, 2.6, 3, 10, '#fff2c0', 255, seaY + 46.5, -300));
  extra.push(cone(3, 3, 10, PALETTE.accent, 255, seaY + 49.5, -300));
  // A fence along the top, back from the edge.
  for (let z = -40; z <= 40; z += 2.5) if (Math.abs(z) > 3) extra.push(box(0.08, 0.9, 0.08, '#8a6440', t.edgeX - 4, g(t.edgeX - 4) + 0.45, z));
  extra.push(box(0.05, 0.05, 37, '#8a6440', t.edgeX - 4, g(t.edgeX - 4) + 0.75, -21.5));
  extra.push(box(0.05, 0.05, 37, '#8a6440', t.edgeX - 4, g(t.edgeX - 4) + 0.75, 21.5));
  const behind = (x: number): boolean => x < t.edgeX - 8;
  const trees = scatter(rnd, 30, [-200, t.edgeX - 10], [-160, 160], 14, g, behind);
  const roundTrees = scatter(rnd, 16, [-200, t.edgeX - 10], [-160, 160], 14, g, behind);
  return outdoor(env, mat, { ground, extra, trees, roundTrees, sockAt: [-3, g(-3), -10], skyTop: '#7fb6df', horizon: '#eef1ea', gulls: true, seaY }, rnd);
}

export function buildScenery(env: Environment, mat: THREE.Material): Scenery {
  switch (env.id) {
    case 'classroom':
      return classroom(env, mat);
    case 'gym':
      return gym(env, mat);
    case 'hangar':
      return hangar(env, mat);
    case 'hill':
      return hill(env, mat);
    case 'cliff':
      return cliff(env, mat);
    case 'meadow':
      return meadow(env, mat);
    default:
      // Unknown places: a plain room of the right size indoors, a field outdoors.
      if (env.indoor && env.bounds) {
        const group = new THREE.Group();
        group.add(mesh(roomShell(env.bounds, { floor: PALETTE.wood, plankWidth: 0.3, wall: '#efe1c6', wallLow: '#d9c3a0', ceiling: '#f7f1e5' }), mat));
        return staticScenery(group, '#efe2c8', 40, 200);
      }
      return meadow(env, mat);
  }
}

/** Dispose every geometry and every material under `root`, except materials marked `userData.shared`. */
export function disposeTree(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    if (m.material) for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mm);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => {
    if (!m.userData.shared) m.dispose();
  });
}
