import type { Topic } from './types';

export const reynolds: Topic = {
  id: 'reynolds',
  title: 'Reynolds number',
  summary: 'Paper planes live at Reynolds numbers of about ten thousand to a hundred thousand. Here is what that number means and what it changes.',
  icon: 'scale',
  tone: 'plum',
  sections: [
    {
      id: 'what-it-is',
      heading: 'One number for “how syrupy is the air?”',
      blocks: [
        {
          kind: 'p',
          text: 'Air is slightly sticky. Whether that stickiness matters depends on how big and fast you are. The **Reynolds number** compares the air’s tendency to keep moving with its tendency to smear motion out:',
        },
        {
          kind: 'formula',
          lines: ['Re = V · c / ν'],
          where: 'V is airspeed, c the wing chord (front-to-back depth) and ν the kinematic viscosity of air, about 1.5 × 10⁻⁵ m²/s at room temperature.',
          info: { label: 'Example', text: 'A wing 10 cm deep at 5 m/s: 5 × 0.1 / 0.000015 ≈ 33,000.' },
        },
        {
          kind: 'p',
          text: 'A gliding paper plane, chord 5 to 25 cm at 3 to 5 m/s, sits around **Re = 2 × 10⁴ to 6 × 10⁴**. A hard launch pushes it toward 10⁵ or a little more. An airliner wing is in the tens of millions. A fruit fly is in the hundreds.',
        },
        { kind: 'diagram', id: 'reynolds-scale', caption: 'Reynolds numbers on a logarithmic scale. Each tick is ten times the last.' },
      ],
    },
    {
      id: 'what-changes',
      heading: 'What changes down here',
      blocks: [
        {
          kind: 'list',
          items: [
            '**The boundary layer stays smooth.** The thin layer of air dragged along by the paper stays laminar over the whole chord. Smooth layers give low friction but separate easily.',
            '**Flow breaks away at the sharp edge.** On a thin plate the flow leaves the leading edge almost at once, then reattaches a little way back, trapping a small bubble. Stall comes when that bubble bursts or the tip vortices take over.',
            '**Thin plates are surprisingly good.** In this range thin flat or slightly curved plates were reported to beat thick, rounded aerofoils, which lose their advantage at low Reynolds number.',
            '**Friction matters more.** Skin friction grows as Re falls, roughly as 1/√Re, so slow, small planes pay a larger share of their drag to friction.',
            '**Surface roughness does not.** Copy paper is smooth enough to count as aerodynamically smooth here. Blunt folded edges and layer steps matter far more than paper texture.',
          ],
        },
        {
          kind: 'formula',
          lines: ['C_f ≈ 1.328 / √Re   (one face, laminar)'],
          where: 'The Blasius friction law. Both faces of a strip feel it.',
        },
        {
          kind: 'p',
          text: 'Happily, measurements reported for thin flat plates show their lift changing little across this range, so the lab uses one family of plate curves and lets mainly the friction depend on Reynolds number. That is a simplification, and one reason the lab’s numbers are a guide rather than a measurement.',
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Below 2 × 10⁴',
          text: 'Very small or slow planes go below the range the notes could support. There, stall behaviour is uncertain and the lab’s numbers are a rougher guide.',
        },
      ],
    },
  ],
  sure: {
    solid: [
      'The definition of Reynolds number, the air viscosity and the Re ranges are arithmetic (derived in the notes).',
      'The Blasius laminar-friction law was confirmed in open-source code during research.',
    ],
    calibrated: [
      'Using one family of plate curves for all Reynolds numbers, with mainly friction varying, is our modelling choice.',
    ],
    unverified: [
      'The claim that thin plates are insensitive to Re and beat thick aerofoils comes from paper abstracts and snippets, not full texts.',
      'Below Re ≈ 2 × 10⁴ the stall and bubble behaviour is uncertain, and a reported near-zero-angle lift oddity at higher aspect ratios is not modelled.',
    ],
  },
  sources: ['01:S1', '01:S5', '01:S6', '01:S7', '01:S11', '01:S14', '01:S34', '04:S25', '04:S27'],
};
