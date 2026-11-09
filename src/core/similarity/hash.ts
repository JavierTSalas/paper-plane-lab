import { hash32 } from '../math/rng';
import type { PosedModel } from '../types';

/**
 * Two-stage quantisation of body-frame coordinates (metres).
 *
 * Stage 1 snaps to whole nanometres (round half away from zero), which absorbs floating-point fold
 * noise (around 1e-16 m). Stage 2 rounds the integer nanometre count to the 0.1 mm hash quantum
 * (docs/ARCHITECTURE.md section 8) with exact integer arithmetic, half away from zero so mirrored
 * halves quantise symmetrically.
 *
 * Why: sheet dimensions are decimal millimetres, so fold lines often land EXACTLY on a 0.05 mm
 * boundary (A4 width / 8 = 26.25 mm). Single-stage rounding would decide those by float noise.
 * Here they are snapped to the exact boundary first and then always round the same way.
 * Limit: a coordinate whose float error straddles a nanometre half-step lying within 0.5 nm of a
 * 0.05 mm boundary can still flip. Decimal-millimetre designs do not produce such values.
 */
const NM_PER_M = 1e9;
/** 0.1 mm in nanometres: the hash quantum (docs/ARCHITECTURE.md section 8). */
const QUANTUM_NM = 100_000;

const roundHalfAway = (x: number): number => (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5));

export function quantise(metres: number): number {
  const nm = roundHalfAway(metres * NM_PER_M);
  const q = nm < 0 ? -Math.floor((-nm + QUANTUM_NM / 2) / QUANTUM_NM) : Math.floor((nm + QUANTUM_NM / 2) / QUANTUM_NM);
  return q === 0 ? 0 : q; // fold -0 into 0
}

type QVert = [number, number, number];

const cmpVert = (a: QVert, b: QVert): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Canonical text of one polygon: deduplicated, rotated to its smallest vertex, winding kept. */
function canonicalPolygon(verts: readonly (readonly [number, number, number])[]): string {
  const q: QVert[] = [];
  for (const v of verts) {
    const p: QVert = [quantise(v[0]), quantise(v[1]), quantise(v[2])];
    if (q.length === 0 || cmpVert(q[q.length - 1], p) !== 0) q.push(p);
  }
  while (q.length > 1 && cmpVert(q[0], q[q.length - 1]) === 0) q.pop();
  let start = 0;
  for (let k = 1; k < q.length; k++) if (cmpVert(q[k], q[start]) < 0) start = k;
  const parts: string[] = [];
  for (let k = 0; k < q.length; k++) {
    const p = q[(start + k) % q.length];
    parts.push(`${p[0]},${p[1]},${p[2]}`);
  }
  return parts.join(';');
}

/** Second, independent 32-bit hash: FNV-1a with a different offset basis, over the text reversed, then fmix32. */
function hash32b(text: string): number {
  let h = 0x9e3779b9; // golden-ratio constant as offset basis (independent of FNV's 0x811c9dc5)
  for (let i = text.length - 1; i >= 0; i--) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // MurmurHash3 fmix32 finaliser for avalanche.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const hex8 = (x: number): string => x.toString(16).padStart(8, '0');

/** The canonical geometry string hashed by geometryHash (exposed for debugging and tests). */
export function canonicalGeometry(model: PosedModel): string {
  const polys = model.pieces.map((p) => canonicalPolygon(p.verts)).filter((s) => s.length > 0);
  polys.sort();
  return polys.join('|');
}

/**
 * Canonical hash of the folded 3D geometry: 16 hex characters. Independent of colours, names,
 * piece ids, panel indices, layer numbers, piece order and the start vertex of each polygon.
 * Sensitive to vertex positions at 0.1 mm and to polygon winding. Equal hash = same airplane.
 */
export function geometryHash(model: PosedModel): string {
  const text = canonicalGeometry(model);
  return hex8(hash32(text)) + hex8(hash32b(text));
}
