import { mirrorStep } from '../fold';
import type { FoldLine, FoldStep, FoldStepCrease, FoldStepFold, TrimSpec, Vec2 } from '../types';

/** No bends, no ballast. Presets override what they need. */
export const DEFAULT_TRIM: TrimSpec = {
  elevatorDeg: 0,
  elevatorChordFrac: 0.1,
  aileronDeg: 0,
  rudderDeg: 0,
  clip: null,
};

export const DEG = Math.PI / 180;

/** Which side of the directed line a->b the point p lies on. */
export function sideOf(a: Vec2, b: Vec2, p: Vec2): 'left' | 'right' {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  return cross > 0 ? 'left' : 'right';
}

export interface FoldOptions {
  dir?: 'valley' | 'mountain';
  layers?: 'all' | 'flap';
  pick?: Vec2;
}

/**
 * A fold along the line a->b that moves the side containing `movingPoint`.
 * Naming a point in the moving region is harder to get wrong than naming left or right.
 */
export function foldAlong(a: Vec2, b: Vec2, movingPoint: Vec2, label: string, opts: FoldOptions = {}): FoldStepFold {
  return {
    kind: 'fold',
    line: { a, b },
    moving: sideOf(a, b, movingPoint),
    dir: opts.dir ?? 'valley',
    layers: opts.layers ?? 'all',
    ...(opts.pick ? { pick: opts.pick } : {}),
    label,
  };
}

export function creaseAlong(a: Vec2, b: Vec2, label: string): FoldStepCrease {
  return { kind: 'crease', line: { a, b }, label };
}

/** The step followed by its mirror image about the centreline, with its own label. */
export function withMirror(step: FoldStepFold, centreX: number, mirrorLabel: string): FoldStep[] {
  return [step, { ...mirrorStep(step, centreX), label: mirrorLabel }];
}

export const line = (a: Vec2, b: Vec2): FoldLine => ({ a, b });

/**
 * The part of the infinite line through a and b that lies inside a convex polygon, directed like a->b.
 * Shape lines are infinite for the physics; clipping them to the outline is for drawing only.
 * Returns the line unchanged when it misses the polygon.
 */
export function clipLine(a: Vec2, b: Vec2, polygon: readonly Vec2[]): FoldLine {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let lo = -Infinity;
  let hi = Infinity;
  // Counter-clockwise or clockwise: orient by the signed area.
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  const sign = area >= 0 ? 1 : -1;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    // Inside = left of every edge of a counter-clockwise polygon.
    const at = sign * (ex * (a[1] - p[1]) - ey * (a[0] - p[0]));
    const rate = sign * (ex * dy - ey * dx);
    if (Math.abs(rate) < 1e-15) {
      if (at < 0) return { a, b };
      continue;
    }
    const t = -at / rate;
    if (rate > 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
  }
  if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return { a, b };
  return { a: [a[0] + lo * dx, a[1] + lo * dy], b: [a[0] + hi * dx, a[1] + hi * dy] };
}
