import type { PaperSpec } from '../../types';
import { lockFolds } from '../families';
import { DEFAULT_TRIM, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** The locking tip shows about an inch below the flaps on Letter paper (doc 05 section 3.2). */
const TIP_HEIGHT = 25.4 / 215.9;
/** "Body about half an inch tall" on Letter paper (doc 05 section 3.3). */
const BODY_HEIGHT = 12.7 / 215.9;
/** The tip may take at most this share of the room below the first flaps, so a gap always remains under it. */
const MAX_TIP_SHARE = 0.45;

/**
 * The Stable (Fold'N Fly): modelled as the Harrier's flat fold with a one-inch locking tip and wings folded
 * parallel to the keel half an inch up (docs/research/05-designs-darts.md sections 3.2 to 3.4). The doc
 * marks this reading as provisional.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const tip = Math.min(TIP_HEIGHT * W, MAX_TIP_SHARE * Math.max(0, H - W));
  const { steps, yNose } = lockFolds(paper, { tipGap: H - W - 2 * tip });
  const d = BODY_HEIGHT * W;
  const wingLine = line([cx + d, 0], [cx + d, yNose - d]);

  return {
    steps,
    shape: {
      keel: 'mountain',
      keelSpreadDeg: 4,
      wingLine,
      dihedralDeg: 7,
      wingletLine: null,
      wingletDeg: 0,
    },
    trim: { ...DEFAULT_TRIM, elevatorDeg: 3, elevatorChordFrac: 0.08 },
  };
}

export const stable: PlanePreset = {
  id: 'stable',
  name: 'The Stable',
  category: 'glider',
  blurb: 'Big flat wings on a shallow body. Slow, steady, and happy to loop.',
  story:
    'A lock-nosed glider from the Fold\'N Fly collection, listed there for time aloft and tricks. ' +
    'Almost the whole sheet ends up as wing, so it flies slowly and floats where a dart would drop. ' +
    'Bend the back edges up a little more and it will loop.',
  difficulty: 1,
  orientation: 'portrait',
  recommendedSizeId: 'letter',
  fidelity: 'approximate',
  fidelityNote: 'Rebuilt from text extracts of the Fold\'N Fly page as a Harrier-style lock fold; one extract disagrees, so the real nose may differ.',
  build,
  throwHint: { speed: 5, pitchDeg: 0, note: 'A gentle, level push. Let it float.' },
  sources: [
    'https://www.foldnfly.com/2.html',
    'https://scienceclass3000.weebly.com/uploads/5/4/5/9/5459088/fold_n_fly_%E2%9C%88_the_stable_3.pdf',
  ],
};
