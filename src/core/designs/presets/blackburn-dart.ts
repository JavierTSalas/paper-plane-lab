import type { PaperSpec, Vec2 } from '../../types';
import { DART_K, dartFolds } from '../families';
import { clipLine, DEFAULT_TRIM, DEG, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

const HINGE_ANGLE = 11.25 * DEG;
/** Wingtip height at its front corner: half an inch on Letter paper (doc 05 section 4.2, unverified there). */
const TIP_HEIGHT = 12.7 / 215.9;
/** Least wingtip height left at the trailing edge, as a share of the sheet width (keeps the fold on the bottom edge). */
const MIN_TAIL_TIP = 0.015;

/**
 * Ken Blackburn's Basic Dart: the Classic Dart with the wingtips folded up and the wings in a slight "Y"
 * (docs/research/05-designs-darts.md section 4). The wingtip line runs parallel to the wing hinge.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const { steps, nose, shoulder, rightOutline } = dartFolds(paper);
  const sin = Math.sin(HINGE_ANGLE);
  const cos = Math.cos(HINGE_ANGLE);
  const wingEnd: Vec2 = [cx + H * Math.tan(HINGE_ANGLE), 0];

  // Distance of the shoulder from the hinge, measured square to the hinge: the widest point of the wing.
  const reach = (shoulder[0] - cx) * cos - (H - shoulder[1]) * sin;
  // On long sheets the side edge runs away from the hinge toward the tail; the tip is made tall enough
  // to still reach the trailing edge (doc 05 section 4.2 gives the limit (H - kW) sin 11.25 degrees).
  const sideDrop = Math.max(0, H - DART_K * W) * sin;
  const tipHeight = Math.min(0.6 * reach, Math.max(TIP_HEIGHT * W, sideDrop + MIN_TAIL_TIP * W));
  const offset = reach - tipHeight;
  // A point on the winglet line: `offset` square out from the hinge at the nose, then along the hinge direction.
  const start: Vec2 = [nose[0] + offset * cos, nose[1] + offset * sin];
  const along: Vec2 = [start[0] + sin, start[1] - cos];
  const wingletLine = clipLine(start, along, rightOutline);

  return {
    steps,
    shape: {
      keel: 'valley',
      keelSpreadDeg: 4,
      wingLine: line(nose, wingEnd),
      dihedralDeg: 7,
      wingletLine,
      wingletDeg: 90,
    },
    trim: { ...DEFAULT_TRIM, elevatorDeg: 6, elevatorChordFrac: 0.08 },
  };
}

export const blackburnDart: PlanePreset = {
  id: 'blackburn-dart',
  name: 'Blackburn Dart',
  category: 'dart',
  designer: 'Ken Blackburn',
  blurb: 'The classic dart, tuned by a record holder: wingtips up, wings in a shallow Y.',
  story:
    'Ken Blackburn, an aerospace engineer who held the world record for time aloft four times, teaches this dart in ' +
    'The World Record Paper Airplane Book. It is the Classic Dart with two refinements: the wingtips are folded up into small fins, ' +
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
