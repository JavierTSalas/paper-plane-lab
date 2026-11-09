/** Pure helpers for the fold workbench: drag handles, snapping, mirrored folds, shape lines. */
import { applyStep, foldPointToPoint, mirrorStep, piecePolygon, tableBounds } from '../../core/fold';
import type { FlatState, FoldIssue, FoldLine, FoldStep, StepFrame, Vec2 } from '../../core/types';

export interface DragHandle {
  /** The corner or edge point the player moves, table frame. */
  from: Vec2;
  /** Where it lands. */
  to: Vec2;
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Signed distance of p from the directed line (positive on the left). */
function lineOffset(line: FoldLine, p: Vec2): number {
  const d = sub(line.b, line.a);
  const len = Math.hypot(d[0], d[1]) || 1;
  return (d[0] * (p[1] - line.a[1]) - d[1] * (p[0] - line.a[0])) / len;
}

/** Mirror image of p across the line. */
export function reflect(line: FoldLine, p: Vec2): Vec2 {
  const d = sub(line.b, line.a);
  const len2 = dot(d, d) || 1;
  const t = dot(sub(p, line.a), d) / len2;
  const foot: Vec2 = [line.a[0] + d[0] * t, line.a[1] + d[1] * t];
  return [2 * foot[0] - p[0], 2 * foot[1] - p[1]];
}

/**
 * The point a player drags to perform a fold step: the moving vertex farthest from the fold line, and
 * where it lands. Ties go to the higher point (nearer the nose), which is how folding diagrams read.
 * Null for flips and skipped steps.
 */
export function stepHandle(frame: StepFrame): DragHandle | null {
  const axis = frame.axis;
  if (!axis || frame.movingIds.length === 0) return null;
  const moving = new Set(frame.movingIds);
  let best: Vec2 | null = null;
  let bestD = -Infinity;
  for (const piece of frame.split) {
    if (!moving.has(piece.id)) continue;
    for (const v of piecePolygon(piece)) {
      const d = Math.abs(lineOffset(axis, v));
      if (d > bestD + 1e-6 || (best && Math.abs(d - bestD) <= 1e-6 && v[1] > best[1])) {
        best = v;
        bestD = Math.max(d, bestD);
      }
    }
  }
  return best ? { from: best, to: reflect(axis, best) } : null;
}

/** How far along from -> to a point has been dragged, 0..1 (unclamped). Works in any 2D space, e.g. screen pixels. */
export function progressAlong(from: Vec2, to: Vec2, p: Vec2): number {
  const d = sub(to, from);
  const len2 = dot(d, d);
  return len2 > 0 ? dot(sub(p, from), d) / len2 : 0;
}

/** The nearest of `points` within `radius` of p, or null. */
export function nearest(points: readonly Vec2[], p: Vec2, radius: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = radius;
  for (const q of points) {
    const d = dist(p, q);
    if (d <= bestD) {
      best = q;
      bestD = d;
    }
  }
  return best;
}

/**
 * Snap the direction from `from` to `to` to a multiple of `stepDeg` when it is within `tolDeg` of one.
 * The length is kept. Returns the snapped point and whether it snapped.
 */
export function snapAngle(from: Vec2, to: Vec2, stepDeg = 15, tolDeg = 4): { p: Vec2; snapped: boolean } {
  const d = sub(to, from);
  const len = Math.hypot(d[0], d[1]);
  if (len < 1e-9) return { p: to, snapped: false };
  const deg = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  const target = Math.round(deg / stepDeg) * stepDeg;
  if (Math.abs(deg - target) > tolDeg) return { p: to, snapped: false };
  const r = (target * Math.PI) / 180;
  return { p: [from[0] + len * Math.cos(r), from[1] + len * Math.sin(r)], snapped: true };
}

/** True when both lines lie on the same infinite line. */
export function sameLine(l1: FoldLine, l2: FoldLine, tol = 1e-6): boolean {
  return Math.abs(lineOffset(l1, l2.a)) <= tol && Math.abs(lineOffset(l1, l2.b)) <= tol;
}

/** The step, and its mirror image about the centreline when `mirror` is on and the step is not its own mirror. */
export function withMirrorStep(step: FoldStep, mirror: boolean, centreX: number): FoldStep[] {
  if (!mirror || step.kind === 'flip') return [step];
  const m = mirrorStep(step, centreX);
  if (m.kind === 'flip' || sameLine(step.line, m.line)) return [step];
  return [step, m];
}

export interface Trial {
  state: FlatState;
  issues: FoldIssue[];
  /** True when every step applied without an error. */
  ok: boolean;
}

/** Apply steps on top of a state without committing them. */
export function trySteps(state: FlatState, steps: readonly FoldStep[], firstIndex: number): Trial {
  let s = state;
  const issues: FoldIssue[] = [];
  steps.forEach((step, i) => {
    const out = applyStep(s, step, firstIndex + i);
    s = out.state;
    issues.push(...out.issues);
  });
  return { state: s, issues, ok: !issues.some((i) => i.severity === 'error') };
}

/** A drag-to-fold step: the perpendicular bisector of from -> to, moving the side `from` is on. */
export function pointToPointStep(
  from: Vec2,
  to: Vec2,
  opts: { dir: 'valley' | 'mountain'; layers: 'all' | 'flap'; creaseOnly: boolean },
): FoldStep {
  const line = foldPointToPoint(from, to);
  if (opts.creaseOnly) return { kind: 'crease', line };
  // A pick right on a corner can sit on an edge; nudge it a hair toward the line.
  const mid: Vec2 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const k = Math.min(1, 0.0005 / Math.max(1e-9, dist(from, mid)));
  const pick: Vec2 = [from[0] + (mid[0] - from[0]) * k, from[1] + (mid[1] - from[1]) * k];
  return { kind: 'fold', line, moving: 'left', dir: opts.dir, layers: opts.layers, ...(opts.layers === 'flap' ? { pick } : {}) };
}

/** A fold along a given line, moving the side containing `side`. */
export function lineStep(
  line: FoldLine,
  side: Vec2,
  opts: { dir: 'valley' | 'mountain'; layers: 'all' | 'flap'; creaseOnly: boolean },
): FoldStep {
  if (opts.creaseOnly) return { kind: 'crease', line };
  const moving = lineOffset(line, side) > 0 ? 'left' : 'right';
  return { kind: 'fold', line, moving, dir: opts.dir, layers: opts.layers, ...(opts.layers === 'flap' ? { pick: side } : {}) };
}

/** Point-in-convex-polygon, either winding. */
function inside(poly: readonly Vec2[], p: Vec2): boolean {
  let sign = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = (poly[i]![0] - poly[j]![0]) * (p[1] - poly[j]![1]) - (poly[i]![1] - poly[j]![1]) * (p[0] - poly[j]![0]);
    if (Math.abs(c) < 1e-12) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The most layers of paper stacked anywhere on the model (sampled at every piece's centroid). */
export function maxLayers(state: FlatState): number {
  const polys = state.pieces.map(piecePolygon);
  let best = polys.length ? 1 : 0;
  for (const poly of polys) {
    const c: Vec2 = [poly.reduce((s, v) => s + v[0], 0) / poly.length, poly.reduce((s, v) => s + v[1], 0) / poly.length];
    let n = 0;
    for (const q of polys) if (inside(q, c)) n++;
    best = Math.max(best, n);
  }
  return best;
}

/* ------------------------------------------------------------------ shape lines */

export interface WingOffsets {
  /** Distance of the wing line from the centreline at the nose (top of the model), metres. */
  nose: number;
  /** At the tail (bottom of the model). */
  tail: number;
}

function xAtY(line: FoldLine, y: number): number | null {
  const dy = line.b[1] - line.a[1];
  if (Math.abs(dy) < 1e-9) return null;
  return line.a[0] + ((y - line.a[1]) / dy) * (line.b[0] - line.a[0]);
}

/** Wing line offsets read off a line on the right half. */
export function wingOffsets(flat: FlatState, line: FoldLine): WingOffsets {
  const cx = flat.paper.width / 2;
  const { min, max } = tableBounds(flat);
  const top = xAtY(line, max[1]);
  const bottom = xAtY(line, min[1]);
  return { nose: Math.max(0, (top ?? line.a[0]) - cx), tail: Math.max(0, (bottom ?? line.b[0]) - cx) };
}

/** The wing line from nose to tail at the given offsets from the centreline. */
export function wingLineFrom(flat: FlatState, o: WingOffsets): FoldLine {
  const cx = flat.paper.width / 2;
  const { min, max } = tableBounds(flat);
  return { a: [cx + o.nose, max[1]], b: [cx + o.tail, min[1]] };
}

/** Half-width of the folded model to the right of the centreline (the wider side), metres. */
export function halfReach(flat: FlatState): number {
  const cx = flat.paper.width / 2;
  const { min, max } = tableBounds(flat);
  return Math.max(max[0] - cx, cx - min[0]);
}

/** Winglet line parallel to the centreline, `size` metres in from the wing tip. */
export function wingletLineFrom(flat: FlatState, size: number): FoldLine {
  const cx = flat.paper.width / 2;
  const { min, max } = tableBounds(flat);
  const x = cx + halfReach(flat) - size;
  return { a: [x, max[1]], b: [x, min[1]] };
}

/** Winglet size of a line: how far in from the tip it sits (mean of its ends). */
export function wingletSize(flat: FlatState, line: FoldLine): number {
  const cx = flat.paper.width / 2;
  return Math.max(0, cx + halfReach(flat) - (line.a[0] + line.b[0]) / 2);
}
