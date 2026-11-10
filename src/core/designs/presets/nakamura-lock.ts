import type { PaperSpec } from '../../types';
import { lockFolds } from '../families';
import { bySheet, DEFAULT_TRIM, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/**
 * Nakamura Lock: docs/research/06-designs-gliders-records.md section 1.
 * Tip gap g = W / 8; wing creases from W / 16 above the keel at the nose to W / 8 at the tail.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const cx = W / 2;
  const { steps, yNose } = lockFolds(paper, { tipGap: W / 8 });
  const dNose = W / 16;
  const dTail = W / 8;
  const wingLine = line([cx + dTail, 0], [cx + dNose, yNose - dNose]);

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
    // Factory trim: dihedral 7 degrees and +2 degrees of elevator on a 12 mm strip (doc 06 section 1); glides
    // near 4.2 m/s, just above the documented 3.1 to 4.0 m/s.
    trim: { ...DEFAULT_TRIM, elevatorDeg: bySheet(paper, 2, 3), elevatorChordFrac: 0.1 },
  };
}

export const nakamuraLock: PlanePreset = {
  id: 'nakamura-lock',
  name: 'Nakamura Lock',
  category: 'glider',
  designer: 'Eiji Nakamura',
  blurb: 'A blunt-nosed glider whose folds lock themselves shut.',
  story:
    'Credited to the origami author Eiji Nakamura, and named for the small triangle that pins its flaps down. ' +
    'The thick, blunt nose survives crashes and puts the centre of gravity near the middle of a broad wing. ' +
    'It rewards a gentle, level push with a long, calm glide.',
  difficulty: 2,
  orientation: 'portrait',
  recommendedSizeId: 'a4',
  fidelity: 'approximate',
  fidelityNote: 'The flat folds follow published instructions; the depth of the wing creases is not given by any source and is our choice.',
  build,
  throwHint: { speed: 5, pitchDeg: 0, note: 'A gentle, level push.' },
  sources: [
    'https://blog.doublehelix.csiro.au/nakamura-lock-plane/',
    'http://themrmatthews.weebly.com/uploads/5/4/5/3/5453968/nakamura_lock.pdf',
    'https://thekidshouldseethis.com/post/how-to-fold-the-nakamura-lock-paper-airplane',
  ],
};
