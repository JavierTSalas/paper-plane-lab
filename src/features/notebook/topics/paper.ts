import type { Topic } from './types';

export const paper: Topic = {
  id: 'paper',
  title: 'Paper',
  summary: 'Sheet sizes, what “80 g/m²” means, how layers make a wing stiff, and why real paper bends where the lab’s does not.',
  icon: 'layers',
  tone: 'mustard',
  sections: [
    {
      id: 'sizes',
      heading: 'Sizes',
      blocks: [
        {
          kind: 'p',
          text: 'Most of the world uses ISO paper. A4 is 210 × 297 mm, and each size in the A series is the one above it cut in half, so the shape never changes: the long side is always √2 times the short side. North America uses US Letter, a little wider and shorter. The lab folds any of these, and every preset adapts its folds to the sheet.',
        },
        { kind: 'diagram', id: 'paper-sizes', caption: 'The A series halves at every step and keeps its shape. US Letter, dashed, is wider and shorter than A4.' },
        { kind: 'widget', id: 'paper-sizes' },
      ],
    },
    {
      id: 'weight',
      heading: 'What 80 g/m² means',
      blocks: [
        {
          kind: 'p',
          text: 'Paper is sold by **grammage**: the mass of one square metre. Ordinary office paper is 80 g/m², about 0.1 mm thick. Folding never adds or removes paper, so a plane’s mass is simply sheet area times grammage.',
        },
        {
          kind: 'formula',
          lines: ['m = G · w · h'],
          where: 'G is grammage, w and h the sheet’s width and height. A4 at 80 g/m²: 0.080 × 0.210 × 0.297 = 0.00499 kg.',
          info: { label: 'And US paper?', text: 'US “20 lb bond” is about 75 g/m², “24 lb” about 90 g/m². Both Guinness and Red Bull allow up to 100 g/m².' },
        },
        {
          kind: 'p',
          text: 'The lab uses one stock for every sheet: 80 g/m², {{length:0.000106|3}} thick. Record teams often go up to the 100 g/m² limit for a stiffer, heavier plane.',
        },
      ],
    },
    {
      id: 'flex',
      heading: 'Layers, stiffness, and why real paper flexes',
      blocks: [
        {
          kind: 'p',
          text: 'A single sheet is floppy. An unsupported strip longer than about 6 to 8 cm sags visibly under its own weight, and a hard throw loads a wing to several times its weight. Stacking layers helps a lot. Loose layers that can slide add their stiffness: four layers are about four times as stiff. Layers locked together by creases act as one thick plate, up to n³ times as stiff: in theory a locked four-layer leading edge can be up to 64 times stiffer than one layer.',
        },
        { kind: 'diagram', id: 'layers', caption: 'Bending stiffness of one layer, four sliding layers and four locked layers.' },
        {
          kind: 'p',
          text: 'The lab treats every panel as rigid. That is fair for thick, creased, braced wings, and least fair for single-layer wing tips during a fast launch, where real paper bends, twists and can flutter. Paper also softens in damp air, and folds slowly relax. None of these are modelled.',
        },
        {
          kind: 'callout',
          tone: 'caveat',
          title: 'The biggest gap',
          text: 'Wing flex is the largest thing the lab leaves out. If a design relies on thin, wide wings and a very hard throw, expect the real plane to do worse than the lab’s.',
        },
      ],
    },
  ],
  sure: {
    solid: [
      'Paper sizes are exact standards; mass = grammage × area is exact.',
      'The n and n³ stiffness rules come from standard plate theory (the notes tag the locked case as model knowledge).',
    ],
    calibrated: [
      'One stock (80 g/m², 0.106 mm) is our choice; the thickness is the median of the data sheets in the notes.',
    ],
    unverified: [
      'Single-layer stiffness is derived from one manufacturer’s data sheet and varies about ±30 % by brand.',
      'No copy-paper-specific numbers were found for softening with humidity or for crease relaxation rates.',
    ],
  },
  sources: ['04:S1', '04:S2', '04:S3', '04:S4', '04:S5', '04:S6', '04:S7', '04:S8', '04:S10', '04:S13', '04:S17', '04:S18', '04:S19', '04:S21', '04:S44'],
};
