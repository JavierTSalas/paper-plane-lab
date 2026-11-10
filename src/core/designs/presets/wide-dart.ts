import type { PaperSpec } from '../../types';
import { dartFolds, TAN_22_5 } from '../families';
import { DEFAULT_TRIM, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** Keel depth as a share of the sheet width: 25 mm on A4 (doc 05 section 1.4, the doc 04 variant). */
const KEEL_DEPTH = 25 / 210;

/**
 * Wide Dart: the Classic Dart's flat folds with the wings folded down parallel to the keel, about a
 * finger-width up (docs/research/05-designs-darts.md section 1.4 and the constants table of section 6).
 */
function build(paper: PaperSpec): PresetBuild {
  const H = paper.height;
  const cx = paper.width / 2;
  const { steps } = dartFolds(paper);
  const u = KEEL_DEPTH * paper.width;
  // The hinge starts where it meets the leading edge, u / tan 22.5 degrees behind the nose.
  const wingLine = line([cx + u, 0], [cx + u, H - u / TAN_22_5]);

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
    trim: { ...DEFAULT_TRIM, elevatorDeg: 6, elevatorChordFrac: 0.08 },
  };
}

export const wideDart: PlanePreset = {
  id: 'wide-dart',
  name: 'Wide Dart',
  category: 'dart',
  blurb: 'The classic dart with a shallow keel and wings half as wide again.',
  story:
    'The same five folds as the Classic Dart, but the wings fold down along a line parallel to the keel, a finger-width up, ' +
    'the way many people fold it without thinking. The shallow keel leaves more wing, so it glides slower and flatter than the narrow dart. ' +
    'It is the dart to pick when you want distance from a gentle throw.',
  difficulty: 1,
  orientation: 'portrait',
  recommendedSizeId: 'a4',
  fidelity: 'documented',
  build,
  throwHint: { speed: 8, pitchDeg: 5, note: 'Firm and level. It needs less speed than the narrow dart.' },
  sources: ['https://www.foldnfly.com/1.html', 'https://paperairplanes.co.uk/classic-dart-paper-airplane'],
};
