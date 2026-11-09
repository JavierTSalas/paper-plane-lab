import type { PaperSpec, Vec2 } from '../../types';
import { creaseAlong, DEFAULT_TRIM, DEG, foldAlong, line, withMirror } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/**
 * Classic Dart. Fold sequence: docs/research/05-designs-darts.md section 1.
 * Five flat folds, then the centre fold and wings folded so the leading edge meets the keel.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const nose: Vec2 = [cx, H];

  // The second fold bisects the angle between the slanted edge and the centre crease (22.5 degrees
  // from the crease). On tall sheets it leaves through the long edge; on squarish sheets
  // (H / W < 1.2071) it leaves through the bottom edge instead. Doc 05 section 1.2.
  const k = (1 + Math.SQRT2) / 2;
  const t225 = Math.SQRT2 - 1;
  const leftExit: Vec2 = H >= k * W ? [0, H - k * W] : [cx - H * t225, 0];

  const steps = [
    creaseAlong([cx, 0], [cx, H], 'Fold the sheet in half lengthwise, then unfold. That crease is your centre line.'),
    ...withMirror(
      foldAlong(nose, [0, H - cx], [0, H], 'Fold the top-left corner down to the centre crease.'),
      cx,
      'Fold the top-right corner down to meet it.',
    ),
    ...withMirror(
      foldAlong(nose, leftExit, [0, H - cx], 'Fold the slanted left edge in to the centre crease.'),
      cx,
      'Fold the slanted right edge in the same way.',
    ),
  ];

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
  sources: ['https://www.foldnfly.com/1.html', 'https://airandspace.si.edu/'],
};
