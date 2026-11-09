import { expect } from 'vitest';
import type { FlatPiece, FlatState, Vec2 } from '../types';

/**
 * Invariant checks shared by the fold tests. Written without the engine's own geometry helpers,
 * so a bug there cannot hide itself.
 */

/** Shared edges shorter than this are not checked, metres. */
const MIN_SHARED = 1e-6;
/** Two segments are collinear when their ends are this close to one line, metres. */
const COLLINEAR = 1e-8;
/** How far the two images of a shared edge may lie apart on the table, metres (cuts weld to vertices within 3e-8). */
const CONTINUITY = 2e-7;

export function polygonArea(poly: readonly Vec2[]): number {
  let twice = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    twice += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return twice / 2;
}

export const sheetArea = (state: FlatState): number => state.pieces.reduce((sum, p) => sum + polygonArea(p.sheet), 0);

const toTable = (piece: FlatPiece, p: Vec2): Vec2 => {
  const [a, b, c, d, tx, ty] = piece.iso;
  return [a * p[0] + b * p[1] + tx, c * p[0] + d * p[1] + ty];
};

/** Clip a convex polygon to the left of the directed line p -> q. */
function clipLeft(poly: readonly Vec2[], p: Vec2, q: Vec2): Vec2[] {
  const side = (v: Vec2): number => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]);
  const out: Vec2[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Area two convex counter-clockwise polygons have in common. */
export function overlapArea(p: readonly Vec2[], q: readonly Vec2[]): number {
  let clipped: Vec2[] = [...p];
  for (let i = 0, j = q.length - 1; i < q.length && clipped.length >= 3; j = i++) {
    clipped = clipLeft(clipped, q[j], q[i]);
  }
  return clipped.length >= 3 ? Math.abs(polygonArea(clipped)) : 0;
}

/** The stretch two sheet segments share when they lie on one line. */
export function sharedStretch(a: Vec2, b: Vec2, c: Vec2, d: Vec2): [Vec2, Vec2] | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const off = (p: Vec2): number => ux * (p[1] - a[1]) - uy * (p[0] - a[0]);
  if (Math.abs(off(c)) > COLLINEAR || Math.abs(off(d)) > COLLINEAR) return null;
  const along = (p: Vec2): number => ux * (p[0] - a[0]) + uy * (p[1] - a[1]);
  const lo = Math.max(0, Math.min(along(c), along(d)));
  const hi = Math.min(len, Math.max(along(c), along(d)));
  if (hi - lo < MIN_SHARED) return null;
  return [
    [a[0] + ux * lo, a[1] + uy * lo],
    [a[0] + ux * hi, a[1] + uy * hi],
  ];
}

/** Assignments of the folded (valley or mountain) creases that run through the sheet point. */
function foldedCreasesAt(state: FlatState, p: Vec2): string[] {
  const found = new Set<string>();
  for (const c of state.creases) {
    if (c.assignment === 'aux') continue;
    const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    const ux = (c.b[0] - c.a[0]) / len;
    const uy = (c.b[1] - c.a[1]) / len;
    const off = ux * (p[1] - c.a[1]) - uy * (p[0] - c.a[0]);
    const along = ux * (p[0] - c.a[0]) + uy * (p[1] - c.a[1]);
    if (Math.abs(off) < 1e-7 && along > -1e-7 && along < len + 1e-7) found.add(c.assignment);
  }
  return [...found];
}

/** True when the table point lies inside the piece, at least `depth` from its outline. */
function deepInside(piece: FlatPiece, point: Vec2, depth: number): boolean {
  const table = piece.sheet.map((v) => toTable(piece, v));
  const sign = piece.flipped ? -1 : 1;
  return table.every((a, i) => {
    const b = table[(i + 1) % table.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return (sign * ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]))) / len > depth;
  });
}

function expectPieceSound(piece: FlatPiece, label: string): void {
  const { sheet, iso } = piece;
  const n = sheet.length;
  expect(n, `${label}: vertex count`).toBeGreaterThanOrEqual(3);
  expect(polygonArea(sheet), `${label}: counter-clockwise with real area`).toBeGreaterThan(1e-12);
  for (let i = 0; i < n; i++) {
    const a = sheet[i];
    const b = sheet[(i + 1) % n];
    const c = sheet[(i + 2) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    expect(len, `${label}: no duplicate vertices`).toBeGreaterThan(1e-8);
    // The turn at b, as the distance of c from the line a-b: never to the right.
    expect((ex * (c[1] - b[1]) - ey * (c[0] - b[0])) / len, `${label}: convex`).toBeGreaterThan(-1e-10);
  }
  const [a, b, c, d] = iso;
  expect(a * a + c * c, `${label}: unit column`).toBeCloseTo(1, 12);
  expect(b * b + d * d, `${label}: unit column`).toBeCloseTo(1, 12);
  expect(a * b + c * d, `${label}: orthogonal columns`).toBeCloseTo(0, 12);
  expect(a * d - b * c, `${label}: determinant matches the facing`).toBeCloseTo(piece.flipped ? -1 : 1, 12);
  expect(iso.every(Number.isFinite), `${label}: finite isometry`).toBe(true);
}

/**
 * Paper is continuous: wherever two pieces share a sheet edge, both isometries put that edge at the
 * same place on the table. The two pieces face opposite ways exactly when a folded crease lies on the
 * edge. Then the crease is a valley when the front faces meet (the piece lying face down is the upper
 * one) and a mountain otherwise, and no layer stacked between the two passes through the fold.
 */
function expectContinuous(state: FlatState, label: string): void {
  const { pieces } = state;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const p = pieces[i];
      const q = pieces[j];
      const pair = `${label}: pieces ${p.id} and ${q.id}`;
      for (let k = 0; k < p.sheet.length; k++) {
        for (let m = 0; m < q.sheet.length; m++) {
          const shared = sharedStretch(
            p.sheet[k],
            p.sheet[(k + 1) % p.sheet.length],
            q.sheet[m],
            q.sheet[(m + 1) % q.sheet.length],
          );
          if (!shared) continue;
          for (const end of shared) {
            const u = toTable(p, end);
            const v = toTable(q, end);
            expect(Math.hypot(u[0] - v[0], u[1] - v[1]), `${pair} stay joined`).toBeLessThan(CONTINUITY);
          }
          const at = (t: number): Vec2 => [
            shared[0][0] + (shared[1][0] - shared[0][0]) * t,
            shared[0][1] + (shared[1][1] - shared[0][1]) * t,
          ];
          const folds = foldedCreasesAt(state, at(0.5));
          if (p.flipped === q.flipped) {
            expect(folds, `${pair} lie flat, so no fold is recorded between them`).toEqual([]);
            continue;
          }
          const faceDown = p.flipped ? p : q;
          const faceUp = p.flipped ? q : p;
          expect(folds, `${pair} fold on a crease of the right kind`).toEqual([faceDown.layer > faceUp.layer ? 'valley' : 'mountain']);
          const low = Math.min(p.layer, q.layer);
          const high = Math.max(p.layer, q.layer);
          for (const other of pieces) {
            if (other.layer <= low || other.layer >= high) continue;
            for (const t of [0.25, 0.5, 0.75]) {
              expect(deepInside(other, toTable(p, at(t)), 1e-6), `${pair}: piece ${other.id} passes through their fold`).toBe(false);
            }
          }
        }
      }
    }
  }
}

function expectTiling(state: FlatState, label: string): void {
  const { pieces } = state;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      expect(overlapArea(pieces[i].sheet, pieces[j].sheet), `${label}: pieces ${pieces[i].id} and ${pieces[j].id} overlap on the sheet`).toBeLessThan(1e-11);
    }
  }
}

export interface InvariantOptions {
  /** Check pairwise that no two sheet polygons overlap (quadratic). */
  tiling?: boolean;
  /** Check paper continuity and crease bookkeeping across shared sheet edges (quadratic). */
  continuity?: boolean;
}

/** Everything that must hold for any flat state the engine hands out. */
export function expectValidState(state: FlatState, label: string, options: InvariantOptions = {}): void {
  const { width, height } = state.paper;
  expect(Math.abs(sheetArea(state) / (width * height) - 1), `${label}: sheet area conserved`).toBeLessThan(1e-12);
  state.pieces.forEach((piece) => expectPieceSound(piece, `${label}, piece ${piece.id}`));
  // Layers are a permutation of 0..n-1; the engine also lists the pieces bottom layer first.
  expect(state.pieces.map((p) => p.layer), `${label}: layers are 0..n-1, in order`).toEqual(state.pieces.map((_, i) => i));
  expect(new Set(state.pieces.map((p) => p.id)).size, `${label}: unique ids`).toBe(state.pieces.length);
  for (const crease of state.creases) {
    expect(Math.hypot(crease.b[0] - crease.a[0], crease.b[1] - crease.a[1]), `${label}: crease has length`).toBeGreaterThan(1e-8);
  }
  if (options.tiling) expectTiling(state, label);
  if (options.continuity) expectContinuous(state, label);
}
