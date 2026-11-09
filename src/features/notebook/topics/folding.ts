import type { Topic } from './types';

export const folding: Topic = {
  id: 'folding',
  title: 'Folding',
  summary: 'Simple folds, valleys and mountains, how layers stack, and why a plane folded a millimetre off true will turn.',
  icon: 'fold',
  tone: 'rose',
  sections: [
    {
      id: 'simple-folds',
      heading: 'Simple folds',
      blocks: [
        {
          kind: 'p',
          text: 'Every plane in the lab is made of **simple folds**: pick a straight line, fold everything on one side of it over, and press flat. That covers every classic dart and glider. Fancier origami moves, such as reverse folds, squash folds and tucks, are not used.',
        },
        {
          kind: 'p',
          text: 'Most folds are built from a few easy instructions: bring one point onto another (the fold line is then the perpendicular bisector between them), lay one edge along another, or fold through two points. “Corner to centre crease” is the first kind.',
        },
      ],
    },
    {
      id: 'valley-mountain',
      heading: 'Valley and mountain',
      blocks: [
        {
          kind: 'p',
          text: 'Looking at the paper, a **valley** fold comes toward you, making a V. A **mountain** fold goes away, making a ridge. They are the same fold seen from opposite sides, which is why turning the paper over swaps them. Diagrams draw valleys as dashed lines and mountains as dash-dot lines; the lab also colours them, but the line style alone always tells you which is which.',
        },
        { kind: 'diagram', id: 'fold-lines', caption: 'Valley (dashed) folds toward you; mountain (dash-dot) folds away. A thin solid line is an existing crease.' },
      ],
    },
    {
      id: 'layers',
      heading: 'Layers',
      blocks: [
        {
          kind: 'p',
          text: 'Each fold flips the moving part over and puts it on top (valley) or underneath (mountain), in reversed order. The lab tracks every layer exactly, which is how it knows that a dart’s nose is many layers thick and heavy while its wing tips are a single sheet. That stack decides where the centre of gravity ends up.',
        },
        {
          kind: 'p',
          text: 'Some folds move only the top flap, not every layer. If other layers are in the way, they have to come along; the lab warns you when that happens.',
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'A rule hidden in every fold',
          text: 'Around any point where flat folds meet, the number of mountains and valleys always differs by exactly two, and every other angle adds up to a straight line. Simple folds always obey both rules, so you can count creases on your own plane and check.',
        },
        {
          kind: 'formula',
          lines: ['M − V = ±2', 'θ₁ + θ₃ + θ₅ + … = 180°'],
          where: 'Maekawa’s and Kawasaki’s theorems for a point inside a flat-folded sheet: M and V count mountain and valley creases meeting there, θ are the angles between neighbouring creases.',
        },
      ],
    },
    {
      id: 'symmetry',
      heading: 'Why symmetry matters',
      blocks: [
        {
          kind: 'p',
          text: 'A plane flies straight only if its left and right halves match. A wing a few millimetres bigger on one side lifts more and rolls the plane; a keel folded off the centre line twists it. The result is a turn, and often a spiral into the floor. That is why the fold workbench mirrors your folds by default, and why the lab warns you when a fold leaves the plane lopsided.',
        },
        { kind: 'diagram', id: 'symmetry', caption: 'Top view: a symmetric dart flies straight; one with a larger right wing rolls left and turns.' },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'Crease firmly',
          text: 'Run a thumbnail along each fold. Sharp, matched creases are the cheapest way to make a real plane fly like the lab’s.',
        },
      ],
    },
  ],
  sure: {
    solid: [
      'Simple-fold geometry, layer order and mass are exact; the Maekawa and Kawasaki rules are proven theorems.',
      'Valley and mountain conventions follow the Yoshizawa–Randlett diagram system.',
    ],
    calibrated: [
      'Geometric tolerances (how close two points must be to count as the same) are engineering choices.',
    ],
    unverified: [
      'Some published fold sequences for preset planes were read only from search-result text, without seeing the diagrams; see the design notes.',
      'Non-simple folds needed by some real designs (certain tail locks, reverse folds) are not supported.',
    ],
  },
  sources: ['07:S1', '07:S3', '07:S6', '07:S7', '07:S10', '07:S11', '07:S14', '07:S15', '07:S16', '07:S17', '07:S20', '05:S1', '05:S9'],
};
