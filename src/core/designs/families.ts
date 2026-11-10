/**
 * Flat-fold routines shared by presets of one family. Formulas: docs/research/05-designs-darts.md
 * (dart, sections 1 and 2) and docs/research/06-designs-gliders-records.md (lock, section 1).
 */
import type { FoldStep, PaperSpec, Vec2 } from '../types';
import { creaseAlong, foldAlong, withMirror } from './helpers';

/** (1 + sqrt 2) / 2: the slanted-edge fold of a dart leaves the long edge k sheet-widths below the nose. */
export const DART_K = (1 + Math.SQRT2) / 2;
/** tan 22.5 degrees: half-width of a dart per unit of distance behind its nose. */
export const TAN_22_5 = Math.SQRT2 - 1;

export interface DartFolds {
  steps: FoldStep[];
  nose: Vec2;
  /** Outer corner of the right leading edge: on the long edge of tall sheets, on the bottom edge of squarish ones. */
  shoulder: Vec2;
  /** Right half of the flat outline, counter-clockwise from the tail end of the centre crease. */
  rightOutline: Vec2[];
}

/**
 * Dart family: centre crease, corners to the crease, slanted edges to the crease.
 * The second pair of folds runs 22.5 degrees off the crease. On tall sheets it leaves through the long edge;
 * on squarish sheets (H / W < 1.2071) it leaves through the bottom edge instead (doc 05 section 1.2).
 * `flipBeforeEdges` turns the model over between the two pairs (Bulldog Dart).
 */
export function dartFolds(paper: PaperSpec, opts: { flipBeforeEdges?: boolean } = {}): DartFolds {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const nose: Vec2 = [cx, H];
  const tall = H >= DART_K * W;
  const leftExit: Vec2 = tall ? [0, H - DART_K * W] : [cx - H * TAN_22_5, 0];
  const shoulder: Vec2 = tall ? [W, H - DART_K * W] : [cx + H * TAN_22_5, 0];

  const steps: FoldStep[] = [
    creaseAlong([cx, 0], [cx, H], 'Fold the sheet in half lengthwise, then unfold. That crease is your centre line.'),
    ...withMirror(
      foldAlong(nose, [0, H - cx], [0, H], 'Fold the top-left corner down to the centre crease.'),
      cx,
      'Fold the top-right corner down to meet it.',
    ),
  ];
  if (opts.flipBeforeEdges) steps.push({ kind: 'flip', label: 'Turn the paper over, keeping the point at the top.' });
  steps.push(
    ...withMirror(
      foldAlong(nose, leftExit, [0, H - cx], 'Fold the slanted left edge in to the centre crease.'),
      cx,
      'Fold the slanted right edge in the same way.',
    ),
  );

  const rightOutline: Vec2[] = tall ? [[cx, 0], [W, 0], shoulder, nose] : [[cx, 0], shoulder, nose];
  return { steps, nose, shoulder, rightOutline };
}

export interface LockOptions {
  /** How far above the bottom edge the folded-down nose stops, metres. Clamped so that a tip is left to lock. */
  tipGap: number;
  /** Half of the gap left open along the centre crease by the corner folds, metres (0 = corners meet). */
  centreGap?: number;
}

export interface LockFolds {
  steps: FoldStep[];
  /** y of the nose fold: the blunt nose of the finished plane. */
  yNose: number;
  /** y of the lower edge of the corner flaps, where the lock folds up. */
  yLock: number;
  /** Height of the locking tip, metres. 0 when the sheet is too square to leave one. */
  lockHeight: number;
  centreGap: number;
}

/** A locking tip shorter than this share of the sheet width is not folded at all. */
const MIN_LOCK = 0.01;

/**
 * Lock family (Nakamura Lock, Harrier): corners to the crease, nose folded down to `tipGap` above the bottom
 * edge, corners to the crease again, then the small triangle left showing is folded up over the flaps.
 * The lock needs tipGap < H - W (doc 05 section 3.1, doc 06 section 1); the gap is clamped below that, and on
 * sheets too square to leave a tip the lock step is left out.
 */
export function lockFolds(paper: PaperSpec, opts: LockOptions): LockFolds {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const gap = Math.max(0, opts.centreGap ?? 0);
  const room = Math.max(0, H - W);
  const g = Math.min(opts.tipGap, room);
  const yNose = (H + g) / 2;
  const yLock = yNose - cx + gap;
  // Height of the tip that shows below the flaps.
  const tip = yLock - g;

  const steps: FoldStep[] = [
    creaseAlong([cx, 0], [cx, H], 'Fold the sheet in half lengthwise, then unfold. That crease is your centre line.'),
    ...withMirror(
      foldAlong(
        [cx - gap, H],
        [0, H - cx + gap],
        [0, H],
        gap > 0
          ? 'Fold the top-left corner down, stopping a hair short of the centre crease.'
          : 'Fold the top-left corner down to the centre crease.',
      ),
      cx,
      gap > 0 ? 'Fold the top-right corner down the same way. Leave a thin gap between the two.' : 'Fold the top-right corner down to meet it.',
    ),
    foldAlong(
      [0, yNose],
      [W, yNose],
      [cx, H],
      tip >= MIN_LOCK * W
        ? 'Fold the whole point down like an envelope flap. Stop a little above the bottom edge.'
        : 'Fold the whole point down like an envelope flap, to the bottom edge.',
    ),
    ...withMirror(
      foldAlong([cx - gap, yNose], [0, yLock], [0, yNose], 'Fold the new top-left corner in to the centre crease. A small triangle stays showing below it.'),
      cx,
      'Fold the top-right corner in to meet it.',
    ),
  ];

  let lockHeight = 0;
  if (tip >= MIN_LOCK * W) {
    lockHeight = tip;
    // The tip is a triangle (a trapezoid when the corners left a gap) hanging below the flaps: the lock
    // folds it alone, not the sheet underneath.
    steps.push(
      foldAlong([cx - gap - tip, yLock], [cx + gap + tip, yLock], [cx, g], 'Fold the small triangle up over the two flaps. This locks them in place.', {
        layers: 'flap',
        pick: [cx + 0.25 * tip, yLock - 0.25 * tip],
      }),
    );
  }
  return { steps, yNose, yLock, lockHeight, centreGap: gap };
}
