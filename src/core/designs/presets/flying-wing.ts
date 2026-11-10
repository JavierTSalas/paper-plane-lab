import type { FoldStep, PaperSpec } from '../../types';
import { creaseAlong, DEFAULT_TRIM, foldAlong, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** Leading-edge roll: this many folds, each one strip of height / 8 wide (doc 06 section 5). */
const ROLLS = 4;
const STRIP = 1 / 8;
/** Tip fins: this share of the span each (doc 06 section 5: e = H / 20 of the long side). */
const FIN = 1 / 20;

const ROLL_LABELS = [
  'Fold the top edge back behind the sheet by a thumb-width.',
  'Fold the thick edge back behind the sheet again, the same width.',
  'Roll it back a third time.',
  'Roll it back once more. The thick strip is the front of the wing.',
];

/**
 * Leading-edge-roll flying wing: docs/research/06-designs-gliders-records.md section 5. A LANDSCAPE sheet
 * whose top edge is rolled under four times; no keel, a V crease down the middle and the tips turned up.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const strip = STRIP * H;

  const steps: FoldStep[] = [];
  let top = H;
  for (let i = 0; i < ROLLS; i++) {
    const y = top - strip;
    steps.push(foldAlong([0, y], [W, y], [cx, top], ROLL_LABELS[i] ?? ROLL_LABELS[ROLL_LABELS.length - 1]!, { dir: 'mountain' }));
    top = y;
  }
  steps.push(creaseAlong([cx, 0], [cx, top], 'Fold the wing in half left to right, then open it again into a shallow V.'));

  const fin = FIN * W;
  return {
    steps,
    shape: {
      keel: 'none',
      keelSpreadDeg: 0,
      // The V crease on the centreline is the only "wing fold": both halves tilt up about it.
      wingLine: line([cx, 0], [cx, top]),
      dihedralDeg: 8,
      wingletLine: line([W - fin, 0], [W - fin, top]),
      wingletDeg: 90,
    },
    trim: { ...DEFAULT_TRIM, elevatorDeg: 5, elevatorChordFrac: 0.15 },
  };
}

export const flyingWing: PlanePreset = {
  id: 'flying-wing',
  name: 'Flying Wing',
  category: 'wing',
  blurb: 'No body, no tail: a rolled leading edge and one wide, slow wing.',
  story:
    'A generic tailless glider, folded from a sheet turned sideways. Rolling the front edge over four times makes the stiff, heavy ' +
    'leading edge that every flying wing needs, and the upturned tips keep it pointing forward. ' +
    'It is the slowest plane in the hangar and the most sensitive to how its back edge is bent.',
  difficulty: 2,
  orientation: 'landscape',
  recommendedSizeId: 'a4',
  fidelity: 'approximate',
  fidelityNote: 'A generic leading-edge-roll wing defined in our research notes; it is not one published design.',
  build,
  throwHint: { speed: 3.5, pitchDeg: 0, note: 'Hold it at the back in the middle and let it go with a soft, level push.' },
  sources: ['https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/centre-of-mass-location-flight-modes-stability-and-dynamic-modelling-of-gliders/D4983A693B836A364D19C95B4D5FFC3B'],
};
