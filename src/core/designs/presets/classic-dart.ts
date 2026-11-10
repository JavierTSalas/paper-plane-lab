import type { PaperSpec, Vec2 } from '../../types';
import { dartFolds } from '../families';
import { DEFAULT_TRIM, DEG, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/**
 * Classic Dart. Fold sequence: docs/research/05-designs-darts.md section 1.
 * Five flat folds, then the centre fold and wings folded so the leading edge meets the keel.
 */
function build(paper: PaperSpec): PresetBuild {
  const H = paper.height;
  const cx = paper.width / 2;
  const { steps, nose } = dartFolds(paper);

  // Wing fold: the leading edge is laid onto the keel, so the hinge bisects the 22.5 degree nose
  // angle: 11.25 degrees from the centre crease. Doc 05 section 1.3.
  const wingEnd: Vec2 = [cx + H * Math.tan(11.25 * DEG), 0];

  return {
    steps,
    shape: {
      keel: 'valley',
      keelSpreadDeg: 4,
      wingLine: line(nose, wingEnd),
      dihedralDeg: 3,
      wingletLine: null,
      wingletDeg: 0,
    },
    // A flat wing with a forward centre of gravity needs a little up-elevator to glide (doc 05 section 1.3).
    trim: { ...DEFAULT_TRIM, elevatorDeg: 6, elevatorChordFrac: 0.08 },
  };
}

export const classicDart: PlanePreset = {
  id: 'classic-dart',
  name: 'Classic Dart',
  category: 'dart',
  blurb: 'Five folds. Fast, straight, and the plane everyone folds first.',
  story:
    'Nobody knows who folded the first dart; it has been passed from desk to desk for generations. ' +
    'Most of the paper ends up near the nose, so it points where it is thrown and cuts through the air. ' +
    'Its narrow wings carry little lift, so it flies fast and sinks quickly: a plane for distance, not for time aloft.',
  difficulty: 1,
  orientation: 'portrait',
  recommendedSizeId: 'a4',
  fidelity: 'documented',
  build,
  throwHint: { speed: 9, pitchDeg: 5, note: 'A firm, level throw. Darts like speed.' },
  sources: [
    'https://www.foldnfly.com/1.html',
    'https://howthingsfly.si.edu/sites/default/files/paper-airplane/NASM_paper_plane_printout_b1p3i5.pdf',
    'https://mainestatemuseum.org/wp-content/uploads/2025/08/Basic-Dart-Guide.pdf',
  ],
};
