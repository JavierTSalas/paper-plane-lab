/**
 * Low-poly geometry helpers: every mesh is non-indexed, vertex-coloured, flat-shaded, without uvs, so
 * anything can be merged with anything.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();

/** Linear-space colour of a CSS colour (THREE.Color converts sRGB input). */
export function lin(css: string): THREE.Color {
  return new THREE.Color(css);
}

/** Strip to position + normal and paint every vertex `color` (optionally jittered per triangle). */
export function paint(geo: THREE.BufferGeometry, color: string | THREE.Color, jitter = 0, rnd: () => number = Math.random): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  const base = typeof color === 'string' ? lin(color) : color;
  for (let i = 0; i < n; i += 3) {
    const k = jitter > 0 ? 1 + (rnd() * 2 - 1) * jitter : 1;
    for (let j = 0; j < 3 && i + j < n; j++) {
      colors[(i + j) * 3] = base.r * k;
      colors[(i + j) * 3 + 1] = base.g * k;
      colors[(i + j) * 3 + 2] = base.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g = g as THREE.BufferGeometry;
  return g;
}

/** A painted box centred at (x, y, z). */
export function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, rotY = 0): THREE.BufferGeometry {
  const g = paint(new THREE.BoxGeometry(w, h, d), color);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function cylinder(rTop: number, rBottom: number, h: number, seg: number, color: string, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = paint(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color);
  g.translate(x, y, z);
  return g;
}

export function cone(r: number, h: number, seg: number, color: string, x = 0, y = 0, z = 0, jitter = 0, rnd?: () => number): THREE.BufferGeometry {
  const g = paint(new THREE.ConeGeometry(r, h, seg), color, jitter, rnd);
  g.translate(x, y, z);
  return g;
}

export function blob(r: number, detail: number, color: string, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0, jitter = 0, rnd?: () => number): THREE.BufferGeometry {
  const g = paint(new THREE.IcosahedronGeometry(r, detail), color, jitter, rnd);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

type P3 = readonly [number, number, number];

/**
 * A flat quad a-b-c-d (counter-clockwise seen from the side it faces). Painted, with a face normal.
 * Used for room walls that face inward, so cameras outside the room see through them.
 */
export function quad(a: P3, b: P3, c: P3, d: P3, color: string | THREE.Color): THREE.BufferGeometry {
  const pos = new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, color);
}

/** Merge painted geometries into one (disposes the parts). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('merge: incompatible geometries');
  return g;
}

/** Deterministic pseudo-random numbers for scenery placement (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ seven-segment numerals */

// Segments a..g as rectangles in a unit cell 0.6 wide, 1 tall: [x0, y0, x1, y1].
const T = 0.13;
const SEG: Record<string, readonly [number, number, number, number]> = {
  a: [0, 1 - T, 0.6, 1],
  b: [0.6 - T, 0.5, 0.6, 1],
  c: [0.6 - T, 0, 0.6, 0.5],
  d: [0, 0, 0.6, T],
  e: [0, 0, T, 0.5],
  f: [0, 0.5, T, 1],
  g: [0, 0.5 - T / 2, 0.6, 0.5 + T / 2],
};
const DIGITS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g',
};

/**
 * Flat numerals in a local 2D frame (u right, v up), centred on the origin, height `size`, as triangles
 * at w = 0 facing +w. `place` maps (u, v, w) to world coordinates.
 */
export function numeral(text: string, size: number, color: string, place: (u: number, v: number, w: number) => P3): THREE.BufferGeometry {
  const adv = 0.85 * size;
  const width = text.length * adv - 0.25 * size;
  const pos: number[] = [];
  let x0 = -width / 2;
  for (const ch of text) {
    for (const s of DIGITS[ch] ?? '') {
      const [a, b, c, d] = SEG[s];
      const u0 = x0 + a * size;
      const u1 = x0 + c * size;
      const v0 = -size / 2 + b * size;
      const v1 = -size / 2 + d * size;
      const p = [place(u0, v0, 0), place(u1, v0, 0), place(u1, v1, 0), place(u0, v1, 0)];
      pos.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
    }
    x0 += adv;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return paint(g, color);
}

/** Ground numerals readable by someone looking downrange (+x): text runs along +z, glyph-up is +x. */
export const onGround = (x: number, y: number, z: number) => (u: number, v: number): P3 => [x + v, y, z + u];

/** Upright numerals facing the thrower (toward -x): text runs along +z. */
export const facingThrower = (x: number, y: number, z: number) => (u: number, v: number): P3 => [x, y + v, z + u];

export function colorOf(css: string, out: THREE.Color = tmpColor): THREE.Color {
  return out.set(css);
}
