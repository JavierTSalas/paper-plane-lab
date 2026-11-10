import type { PaperSpec } from '../../types';
import { lockFolds } from '../families';
import { DEFAULT_TRIM, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** Half-gap left along the centre crease: 1.5 mm on A4 (doc 06 section 3, "1-2 mm gaps"). */
const CENTRE_GAP = 1.5 / 210;
/** The wing crease starts about 3 mm above the keel at the nose (doc 06 section 3). */
const NOSE_DEPTH = 3 / 210;

/**
 * Suzanne-class distance glider: the "SZ-proxy" of docs/research/06-designs-gliders-records.md section 3.
 * A Nakamura-family fold that carries the reported features of John Collins's record plane (thin gaps at the
 * centre folds, a very shallow body, wings in a "Y"). It is NOT Collins's published fold sequence.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const cx = W / 2;
  const gap = CENTRE_GAP * W;
  const { steps, yNose } = lockFolds(paper, { tipGap: W / 8, centreGap: gap });
  const dNose = NOSE_DEPTH * W;
  const dTail = W / 16;
  const wingLine = line([cx + dTail, 0], [cx + dNose, yNose - (dNose - gap)]);

  return {
    steps,
    shape: {
      keel: 'mountain',
      keelSpreadDeg: 4,
      wingLine,
      dihedralDeg: 10,
      wingletLine: null,
      wingletDeg: 0,
    },
    // Factory trim: dihedral 10 degrees ("Y") and a flat trailing edge, the bottom of the documented 0 to +6
    // degrees (doc 06 section 3): it then glides near its best glide ratio at about 3.5 m/s.
    trim: { ...DEFAULT_TRIM, elevatorDeg: 0, elevatorChordFrac: 0.1 },
  };
}

export const suzanne: PlanePreset = {
  id: 'suzanne',
  name: 'Suzanne-class Glider',
  category: 'glider',
  blurb: 'A distance glider in the style of the 2012 record plane "Suzanne".',
  story:
    'John Collins designed "Suzanne", which Joe Ayoob threw 69.14 m in 2012, a world record at the time. It surprised people by being a glider, not a dart: ' +
    'thrown hard and high, it climbs, then glides a long way down. This plane is our stand-in built from the features Collins is reported to use ' +
    '(thin gaps at the centre folds, a very shallow body, wings in a Y); his real fold sequence is in his book.',
  difficulty: 3,
  orientation: 'portrait',
  recommendedSizeId: 'a4',
  fidelity: 'approximate',
  fidelityNote: 'Not John Collins\'s published fold: a Nakamura-style stand-in that copies the reported features of Suzanne.',
  build,
  throwHint: { speed: 5, pitchDeg: 0, note: 'Indoors, a smooth level throw. Flatten nothing: it is trimmed to glide.' },
  sources: [
    'https://www.guinnessworldrecords.com/news/2012/2/video-is-this-the-farthest-ever-flight-by-a-paper-airplane',
    'https://science.howstuffworks.com/innovation/everyday-innovations/paper-airplane-guy-john-collins-world-record.htm',
    'https://cdn.bookey.app/files/pdf/book/en/the-new-world-champion-paper-airplane-book.pdf',
  ],
};
