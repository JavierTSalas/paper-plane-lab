import type { FoldStep, PaperSpec } from '../../types';
import { creaseAlong, DEFAULT_TRIM, foldAlong, line, withMirror } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** Extra nose folds after the square nose, each one strip wide (doc 06 section 2: n = 2, strip W / 8). */
const NOSE_ROLLS = 2;
const ROLL_LABELS = ['Fold the top edge down by a thumb-width to thicken the nose.', 'Fold the top edge down by the same amount once more.'];

/**
 * Square-nose basic glider: docs/research/06-designs-gliders-records.md section 2. Corners to the centre,
 * the triangle folded down along its base, two more nose folds for weight, wings parallel to the keel.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const strip = W / 8;
  const yBase = H - cx;

  const steps: FoldStep[] = [
    creaseAlong([cx, 0], [cx, H], 'Fold the sheet in half lengthwise, then unfold. That crease is your centre line.'),
    ...withMirror(
      foldAlong([cx, H], [0, yBase], [0, H], 'Fold the top-left corner down to the centre crease.'),
      cx,
      'Fold the top-right corner down to meet it.',
    ),
    foldAlong([0, yBase], [W, yBase], [cx, H], 'Fold the whole triangle down along its bottom edge. The nose is now square.'),
  ];
  let top = yBase;
  for (let i = 0; i < NOSE_ROLLS; i++) {
    const y = top - strip;
    steps.push(foldAlong([0, y], [W, y], [cx, top], ROLL_LABELS[i] ?? ROLL_LABELS[ROLL_LABELS.length - 1]!));
    top = y;
  }

  const d = W / 8;
  return {
    steps,
    shape: {
      keel: 'mountain',
      keelSpreadDeg: 4,
      wingLine: line([cx + d, 0], [cx + d, top]),
      dihedralDeg: 7,
      wingletLine: null,
      wingletDeg: 0,
    },
    trim: { ...DEFAULT_TRIM, elevatorDeg: 0, elevatorChordFrac: 0.1 },
  };
}

export const basicGlider: PlanePreset = {
  id: 'basic-glider',
  name: 'Basic Glider',
  category: 'glider',
  blurb: 'A square-nosed classroom glider with wide, straight wings.',
  story:
    'A generic classroom design with no known inventor: corners in, nose folded over a few times, wings straight out. ' +
    'The rolled nose is all that keeps it nose-heavy, so it balances close to the edge of stability and flies slowly, nose a little high. ' +
    'It forgives a clumsy throw and shows clearly what moving weight forward does.',
  difficulty: 1,
  orientation: 'portrait',
  recommendedSizeId: 'a4',
  fidelity: 'approximate',
  fidelityNote: 'A generic square-nose glider defined in our research notes from common classroom steps; it is not one published design.',
  build,
  throwHint: { speed: 4.5, pitchDeg: 0, note: 'A soft, level push from shoulder height.' },
  sources: ['https://blog.doublehelix.csiro.au/nakamura-lock-plane/'],
};
