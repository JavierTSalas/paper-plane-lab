import type { PaperSpec } from '../../types';
import { dartFolds } from '../families';
import { DEFAULT_TRIM, foldAlong, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** 1 / (2 sqrt 2): the nose fold lies this many sheet-widths below the point (doc 05 section 2.2). */
const NOSE_DROP = 1 / (2 * Math.SQRT2);
/** (1 - 1 / sqrt 2) / 2: half-width of the snub nose in sheet-widths, and the default body height. */
const NOSE_HALF = (1 - Math.SQRT1_2) / 2;

/**
 * Bulldog Dart: docs/research/05-designs-darts.md section 2. Corners in, turn over, slanted edges in, then
 * the point folded down to where the flaps end, which gives the blunt nose and puts half the paper there.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const { steps, nose } = dartFolds(paper, { flipBeforeEdges: true });
  const yNose = H - NOSE_DROP * W;
  const half = NOSE_HALF * W;
  steps.push(
    foldAlong([cx - half, yNose], [cx + half, yNose], nose, 'Fold the point down to where the two flaps end on the centre crease. That makes the snub nose.'),
  );

  // Wing hinge parallel to the keel, starting at the corner of the snub nose (doc 05 section 2.3, default u_b).
  const wingLine = line([cx + half, 0], [cx + half, yNose]);

  return {
    steps,
    shape: {
      keel: 'valley',
      keelSpreadDeg: 4,
      wingLine,
      dihedralDeg: 3,
      wingletLine: null,
      wingletDeg: 0,
    },
    trim: { ...DEFAULT_TRIM, elevatorDeg: 8, elevatorChordFrac: 0.08 },
  };
}

export const bulldogDart: PlanePreset = {
  id: 'bulldog-dart',
  name: 'Bulldog Dart',
  category: 'dart',
  blurb: 'A dart with its nose folded flat: short, sturdy and hard to crumple.',
  story:
    'A traditional beginner design, named for its snub nose. Folding the point back puts sixteen layers of paper at the front, ' +
    'so it is very nose-heavy: it holds its line well but needs its trailing edges bent up a little to stop it diving. ' +
    'Throw it softer than you think.',
  difficulty: 1,
  orientation: 'portrait',
  recommendedSizeId: 'a4',
  fidelity: 'approximate',
  fidelityNote: 'The flat folds follow the published steps; the height of the wing fold is read from the text, not checked against a diagram.',
  build,
  throwHint: { speed: 8, pitchDeg: 0, note: 'A level push, softer than a dart. A hard throw drives the heavy nose into the floor.' },
  sources: [
    'https://www.artofmanliness.com/skills/just-for-fun/how-to-make-the-worlds-best-paper-airplanes/',
    'https://ourpastimes.com/how-to-make-a-bulldog-dart-paper-airplane-12131546.html',
    'https://www.instructables.com/Best-Paper-Airplane-in-the-World-aka-Bulldog-Dart/',
  ],
};
