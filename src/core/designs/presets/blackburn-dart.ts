import type { PaperSpec } from '../../types';
import { dartFolds, TAN_22_5 } from '../families';
import { bySheet, DEFAULT_TRIM, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** Body height as a share of the sheet width: 25 mm on A4, the Wide Dart's keel. */
const BODY_HEIGHT = 25 / 210;
/** Wingtip height: half an inch on Letter paper (doc 05 section 4.2, unverified there). */
const TIP_HEIGHT = 12.7 / 215.9;

/**
 * Ken Blackburn's Basic Dart: the dart's flat folds, wingtips folded up and the wings in a slight "Y"
 * (docs/research/05-designs-darts.md section 4).
 *
 * The handout's fold-line positions are not known. The doc assumes the Classic Dart's wing fold (leading edge
 * onto the keel). With that wing, turning the tips up removes the rear outer wing area and the neutral point
 * moves ahead of the centre of gravity (static margin -4 to -8 % in the tunnel): it cannot glide. This preset
 * therefore folds the wings parallel to the keel like the Wide Dart, which keeps a margin of 10 to 17 %.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const { steps, shoulder } = dartFolds(paper);
  // Keep a wing between body and wingtip even on squarish sheets, whose darts are narrow at the tail.
  const reach = shoulder[0] - cx;
  const body = Math.min(BODY_HEIGHT * W, 0.3 * reach);
  const tip = Math.min(TIP_HEIGHT * W, 0.25 * reach);
  const wingX = cx + body;
  const tipX = cx + reach - tip;
  // Both lines start where they meet the leading edge.
  const wingLine = line([wingX, 0], [wingX, H - body / TAN_22_5]);
  const wingletLine = line([tipX, 0], [tipX, H - (reach - tip) / TAN_22_5]);

  return {
    steps,
    shape: {
      keel: 'valley',
      keelSpreadDeg: 4,
      wingLine,
      dihedralDeg: 7,
      wingletLine,
      wingletDeg: 90,
    },
    // Factory trim: "bend the elevators up slightly", wings in a slight "Y" (7 degrees; doc: 5 to 10), wingtips
    // vertical. Glides near 4.7 m/s.
    trim: { ...DEFAULT_TRIM, elevatorDeg: bySheet(paper, 2.5, 5), elevatorChordFrac: 0.08 },
  };
}

export const blackburnDart: PlanePreset = {
  id: 'blackburn-dart',
  name: 'Blackburn Dart',
  category: 'dart',
  designer: 'Ken Blackburn',
  blurb: 'A dart tuned by a record holder: wingtips up, wings in a shallow Y.',
  story:
    'Ken Blackburn, an aerospace engineer who held the world record for time aloft four times, teaches this dart in ' +
    'The World Record Paper Airplane Book. It is the familiar dart with two refinements: the wingtips are folded up into small fins, ' +
    'and the wings are raised into a slight Y. Both help it hold its heading, so more of the throw turns into distance.',
  difficulty: 2,
  orientation: 'portrait',
  recommendedSizeId: 'letter',
  fidelity: 'approximate',
  fidelityNote: 'The wing and wingtip fold positions are assumed from the step text; the book\'s numbered fold lines were not seen.',
  build,
  throwHint: { speed: 9, pitchDeg: 5, note: 'A firm throw, just above level.' },
  sources: [
    'https://pimaair.org/wp-content/uploads/2020/01/The-basic-dart_120911.pdf',
    'https://www.hbglibrary.com/titles/ken-blackburn/the-world-record-paper-airplane-book/9780761143833/',
  ],
};
