import type { PaperSpec } from '../../types';
import { lockFolds, TAN_22_5 } from '../families';
import { DEFAULT_TRIM, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** Gap left under the folded-down point: half an inch on Letter paper (doc 05 section 3.1). */
const TIP_GAP = 12.7 / 215.9;

/**
 * Harrier: docs/research/05-designs-darts.md section 3. A lock-family fold with a 90 degree nose; the wings
 * fold down so the leading edge meets the keel, which makes the hinge the 22.5 degree bisector.
 */
function build(paper: PaperSpec): PresetBuild {
  const cx = paper.width / 2;
  const { steps, yNose } = lockFolds(paper, { tipGap: TIP_GAP * paper.width });
  const wingLine = line([cx, yNose], [cx + yNose * TAN_22_5, 0]);

  return {
    steps,
    shape: {
      keel: 'mountain',
      keelSpreadDeg: 4,
      wingLine,
      dihedralDeg: 5,
      wingletLine: null,
      wingletDeg: 0,
    },
    trim: { ...DEFAULT_TRIM, elevatorDeg: 4, elevatorChordFrac: 0.08 },
  };
}

export const harrier: PlanePreset = {
  id: 'harrier',
  name: 'Harrier',
  category: 'hybrid',
  blurb: 'A broad-shouldered dart with a locked nose that glides as well as it darts.',
  story:
    'A traditional design made popular by craft and hobby sites. The folded-down point is held shut by a small triangle, ' +
    'so the heavy nose cannot spring open in flight. Its wide triangular wings and deep keel put it halfway between a dart and a glider: ' +
    'steady, forgiving and good for a long straight glide.',
  difficulty: 2,
  orientation: 'portrait',
  recommendedSizeId: 'letter',
  fidelity: 'approximate',
  fidelityNote: 'The wing fold (leading edge onto the keel) is read from the step text and was not checked against a diagram.',
  build,
  throwHint: { speed: 6, pitchDeg: 0, note: 'A moderate, level throw.' },
  sources: [
    'https://www.artofmanliness.com/skills/just-for-fun/how-to-make-the-worlds-best-paper-airplanes/',
    'https://www.instructables.com/How-to-Fold-the-Harrier-Origami-Paper-Airplane/',
    'https://www.instructables.com/To-Fold-The-Harrier-Paper-Airplane/',
  ],
};
