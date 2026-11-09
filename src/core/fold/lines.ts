import { add2, cross2, dist2, lerp2, norm2, perp2, scale2, sub2 } from '../math';
import { lineDistance, mirrorPoint, toLine } from './geom';
import type { FoldLine, FoldStep, Vec2 } from '../types';

/** Lines closer to parallel than this (sine of the angle between them) have no crossing point. */
const PARALLEL = 1e-9;

/**
 * The fold that puts `from` onto `to`: their perpendicular bisector.
 * `from` lies on the 'left' of the returned line, so fold with `moving: 'left'`.
 * The segment a-b is centred between the two points and as long as their distance,
 * which makes the default flap pick land next to that midpoint.
 */
export function foldPointToPoint(from: Vec2, to: Vec2): FoldLine {
  const mid = lerp2(from, to, 0.5);
  const half = scale2(perp2(sub2(to, from)), 0.5);
  return { a: sub2(mid, half), b: add2(mid, half) };
}

/**
 * The folds that put line l1 onto line l2.
 * Crossing lines give two bisectors, both starting at the crossing point: the first runs along
 * dir(l1) + dir(l2), the second along dir(l1) - dir(l2). Parallel lines give their midline,
 * directed like l1. Degenerate input gives an empty list.
 */
export function bisectorOfLines(l1: FoldLine, l2: FoldLine): FoldLine[] {
  const p = toLine(l1);
  const q = toLine(l2);
  if (!p || !q) return [];
  const sin = cross2(p.u, q.u);
  if (Math.abs(sin) < PARALLEL) {
    const shift = scale2(perp2(p.u), lineDistance(p, q.p) / 2);
    return [{ a: add2(l1.a, shift), b: add2(l1.b, shift) }];
  }
  const reach = Math.max(dist2(l1.a, l1.b), dist2(l2.a, l2.b));
  const meet = add2(p.p, scale2(p.u, cross2(sub2(q.p, p.p), q.u) / sin));
  return [add2(p.u, q.u), sub2(p.u, q.u)].map((dir) => ({
    a: meet,
    b: add2(meet, scale2(norm2(dir), reach)),
  }));
}

/** Point-wise mirror image about x = centreX. Left and right of the mirrored line are swapped. */
export const mirrorLine = (line: FoldLine, centreX: number): FoldLine => ({
  a: mirrorPoint(line.a, centreX),
  b: mirrorPoint(line.b, centreX),
});

/** The same step on the other half of the model. The label is kept as it is. */
export function mirrorStep(step: FoldStep, centreX: number): FoldStep {
  if (step.kind === 'flip') return step;
  const line = mirrorLine(step.line, centreX);
  if (step.kind === 'crease') return { ...step, line };
  const mirrored: FoldStep = { ...step, line, moving: step.moving === 'left' ? 'right' : 'left' };
  return step.pick ? { ...mirrored, pick: mirrorPoint(step.pick, centreX) } : mirrored;
}
