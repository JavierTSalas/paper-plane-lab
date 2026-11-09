import { foldPointToPoint, mirrorStep } from './lines';
import type { FoldLine, FoldStep, PaperSpec } from '../types';

/** Sheets and fold sequences shared by the fold tests. */

export const paperOf = (width: number, height: number, sizeId = 'test'): PaperSpec => ({
  sizeId,
  width,
  height,
  front: '#fdfcf8',
  back: '#8fc1e3',
});

export const A4 = paperOf(0.21, 0.297, 'a4');
export const LETTER = paperOf(0.2159, 0.2794, 'letter');

export const valley = (line: FoldLine, moving: 'left' | 'right' = 'left'): FoldStep => ({
  kind: 'fold',
  line,
  moving,
  dir: 'valley',
  layers: 'all',
});

export const mountain = (line: FoldLine, moving: 'left' | 'right' = 'left'): FoldStep => ({
  kind: 'fold',
  line,
  moving,
  dir: 'mountain',
  layers: 'all',
});

/** A step followed by its mirror image. */
export const both = (step: FoldStep, paper: PaperSpec): FoldStep[] => [step, mirrorStep(step, paper.width / 2)];

/** Classic dart: centre crease, corners to the crease, slanted edges to the crease. */
export function dartSteps(paper: PaperSpec): FoldStep[] {
  const { width: W, height: H } = paper;
  const centre: FoldStep = { kind: 'crease', line: { a: [W / 2, 0], b: [W / 2, H] } };
  const corner = valley(foldPointToPoint([0, H], [W / 2, H - W / 2]));
  const edge = valley({ a: [0, H - (W / 2) * (1 + Math.SQRT2)], b: [W / 2, H] });
  return [centre, ...both(corner, paper), ...both(edge, paper)];
}

/**
 * Nakamura-lock opening: corners to the centre, the nose folded down a little below the corner flaps,
 * corners to the centre again, then the exposed tip folded up over them as a single flap.
 * `gap` is how far below the flaps the nose fold lies, which is also the height of the tip.
 */
export function lockSteps(paper: PaperSpec, gap = 0.02): FoldStep[] {
  const { width: W, height: H } = paper;
  const noseFold = H - W / 2 - gap;
  const tipFold = noseFold - W / 2;
  const tip: FoldStep = {
    kind: 'fold',
    line: { a: [W, tipFold], b: [0, tipFold] },
    moving: 'left',
    dir: 'valley',
    layers: 'flap',
  };
  return [
    { kind: 'crease', line: { a: [W / 2, 0], b: [W / 2, H] } },
    ...both(valley(foldPointToPoint([0, H], [W / 2, H - W / 2])), paper),
    valley({ a: [0, noseFold], b: [W, noseFold] }),
    ...both(valley(foldPointToPoint([0, noseFold], [W / 2, tipFold])), paper),
    tip,
  ];
}

/** Twelve folds that pile up layers: a stress sequence, not an airplane. */
export function busySteps(paper: PaperSpec): FoldStep[] {
  const { width: W, height: H } = paper;
  return [
    ...dartSteps(paper),
    valley({ a: [0, H * 0.82], b: [W, H * 0.82] }),
    ...both(valley({ a: [W * 0.2, 0], b: [W * 0.32, H] }, 'left'), paper),
    mountain({ a: [0, H * 0.3], b: [W, H * 0.36] }, 'right'),
    { kind: 'flip' },
    ...both(valley({ a: [W * 0.38, 0], b: [W * 0.3, H] }, 'left'), paper),
  ];
}
