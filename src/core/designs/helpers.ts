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
