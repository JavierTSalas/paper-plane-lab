import type { Topic } from './types';

export const liftAndDrag: Topic = {
  id: 'lift-and-drag',
  title: 'Lift and drag',
  summary: 'Why a flat sheet lifts at all, why it pays for it in drag, how darts borrow lift from vortices, and what stall looks like.',
  icon: 'fly',
  tone: 'sky',
  sections: [
    {
      id: 'angle-of-attack',
      heading: 'Angle of attack',
      blocks: [
        {
          kind: 'p',
          text: 'A wing does not need a curved top to lift. It needs to meet the air at a slight angle, called the **angle of attack**. Tilt a sheet a few degrees and it deflects air downward; the air pushes back up. That is all lift is: the reaction to turning a stream of air.',
        },
        { kind: 'diagram', id: 'angle-of-attack', caption: 'A flat plate at angle of attack α. The air pushes almost straight out of the plate. Split that push into lift (across the airflow) and drag (along it).' },
        {
          kind: 'p',
          text: 'In a steady glide, three forces balance: lift across the flight path, drag along it, and weight straight down. The plane trades height for speed, sliding down a gentle slope of air.',
        },
        { kind: 'diagram', id: 'glide-forces', caption: 'A steady glide. The glide angle γ is set by the ratio of lift to drag.' },
        {
          kind: 'formula',
          lines: ['L = ½ ρ V² S C_L', 'D = ½ ρ V² S C_D', 'tan γ = D / L'],
          where: 'ρ is air density, V airspeed, S wing area. C_L and C_D are the lift and drag coefficients for the angle of attack.',
          info: { label: 'What is a good glide ratio for paper?', text: 'Lift over drag of about 4 to 6. A measured dart was reported at about 5, which means 5 m forward for every metre down.' },
        },
      ],
    },
    {
      id: 'no-suction',
      heading: 'Why a flat sheet pays extra drag',
      blocks: [
        {
          kind: 'p',
          text: 'A real aeroplane wing has a rounded nose. Air racing around that nose creates suction that pulls the wing slightly forward, cancelling much of the drag that lift would otherwise cost. Paper has a knife-sharp edge. The flow simply breaks away there, so there is **no leading-edge suction**, and the pressure force points straight out of the sheet.',
        },
        {
          kind: 'formula',
          lines: ['C_D = C_D0 + C_L · tan α'],
          where: 'C_D0 is skin friction. The second term is the backward tilt of the plate’s normal force.',
          info: { label: 'Why not the usual induced-drag formula?', text: 'The tilted normal force already contains the drag of making lift. Adding the textbook term on top would count it twice, so the model does not.' },
        },
      ],
    },
    {
      id: 'vortex-lift',
      heading: 'Vortex lift on darts',
      blocks: [
        {
          kind: 'p',
          text: 'Darts have short, swept wings. At larger angles the air rolling off their sharp leading edges winds into two strong vortices lying over the top of the wing. Their low pressure adds **vortex lift**, which keeps growing well past the angle where a long, straight wing would give up. The model uses the classic Polhamus form for it:',
        },
        {
          kind: 'formula',
          lines: ['C_N = K_p sin α cos α + K_v sin² α'],
          where: 'K_p is the ordinary attached-flow part and K_v the vortex part, which grows as the wing gets shorter.',
        },
        { kind: 'diagram', id: 'lift-curve', caption: 'Sketch of the model’s lift curves: a glider-like wing (aspect ratio 3) lifts steeply and stalls early; a dart (delta, aspect ratio 1) lifts gently but keeps going.' },
      ],
    },
    {
      id: 'stall',
      heading: 'Stall',
      blocks: [
        {
          kind: 'p',
          text: 'Raise the angle too far and the flow can no longer stay organised over the top. Lift stops growing and drag shoots up: the wing has **stalled**. The model’s glider-like wing stalls near 13°, while its dart carries on to about 38° thanks to vortex lift. Beyond stall the sheet behaves like a board held in the wind, which is how a stalled plane mushes and drops its nose.',
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'In the tunnel',
          text: 'The wind tunnel draws these curves for your own plane, with the stall marked. Try a dart and a glider side by side.',
        },
      ],
    },
  ],
  sure: {
    solid: [
      'Lift and drag scale with ½ρV²S; a sharp thin plate has no leading-edge suction, so drag includes C_L tan α.',
      'The Helmbold lift slope and the Polhamus vortex-lift form are long-standing results, and their formulas were checked in open-source code during research.',
    ],
    calibrated: [
      'The vortex-lift constant for rectangular wings, the stall blend and the stall angles (about 13° and 38°) are our calibration, not measured polars.',
      'The post-stall curve uses a flat-plate value C_D90 = 1.17 from the notes.',
    ],
    unverified: [
      'The measured paper-dart glide (about 4.9 m/s, L/D about 5) is reported in a paper the research could not open.',
      'Tabulated low-Reynolds wing data were not read in full text.',
    ],
  },
  sources: ['01:S1', '01:S2', '01:S8', '01:S11', '01:S14', '01:S15', '01:S16', '01:S20', '01:S29', '01:S34', '01:S35', '02:S12'],
};
