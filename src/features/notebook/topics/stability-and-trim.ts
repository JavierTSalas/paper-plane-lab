import type { Topic } from './types';

export const stabilityAndTrim: Topic = {
  id: 'stability-and-trim',
  title: 'Stability and trim',
  summary: 'Balance point against neutral point, why flat wings need a little up-elevator, how dihedral keeps wings level, and the gentle swoop called the phugoid.',
  icon: 'target',
  tone: 'sage',
  sections: [
    {
      id: 'static-margin',
      heading: 'Balance against the neutral point',
      blocks: [
        {
          kind: 'p',
          text: 'Every plane has two important points along its length. The **centre of gravity** is where it balances on your fingertip. The **neutral point** is where extra lift acts when the nose pitches up or down. For a stable plane the centre of gravity must sit ahead of the neutral point.',
        },
        { kind: 'diagram', id: 'cg-np', caption: 'Top: balance ahead of the neutral point, so a nose-up bump creates lift behind the balance point and the nose comes back down. Bottom: balance behind it, so the same bump tips the nose further up.' },
        {
          kind: 'formula',
          lines: ['K_n = (x_np − x_cg) / c'],
          where: 'x_np and x_cg are the positions of neutral point and centre of gravity; c is the mean wing chord.',
          info: { label: 'What static margin is good?', text: 'A few percent to around ten percent of the chord. Too little and the plane is twitchy; too much and it needs a lot of up-elevator and flies fast and steep.' },
        },
      ],
    },
    {
      id: 'up-elevator',
      heading: 'Why flat wings need up-elevator',
      blocks: [
        {
          kind: 'p',
          text: 'A stable plane always wants to return to one angle of attack, its **trim**. A perfectly flat wing with its balance ahead of the neutral point can only settle at zero lift, so it dives. Bending the rear edges of the wings up a millimetre or two pushes the tail down, lifting the nose to a useful angle. More static margin needs more up-bend.',
        },
        { kind: 'diagram', id: 'elevator', caption: 'A small up-bend at the trailing edge makes a nose-up moment, so the plane trims at a positive angle of attack.' },
      ],
    },
    {
      id: 'dihedral',
      heading: 'Dihedral keeps the wings level',
      blocks: [
        {
          kind: 'p',
          text: 'Seen from the front, wings tipped up into a shallow “Y” have **dihedral**. When a gust rolls the plane, it starts to slip sideways toward the low wing. The low wing then meets the air at a bigger angle and lifts more, rolling the plane back. A deep keel hanging below the wings works the other way, so dihedral has to outweigh it.',
        },
        { kind: 'diagram', id: 'dihedral', caption: 'Front view of a rolled plane with dihedral: the low wing meets the sideslip at a steeper angle and lifts it back.' },
      ],
    },
    {
      id: 'phugoid',
      heading: 'The phugoid',
      blocks: [
        {
          kind: 'p',
          text: 'Throw a plane too fast and it climbs, slows, noses over, speeds up and climbs again. This slow swoop is the **phugoid**, a trade between height and speed. Its period depends almost only on speed, and its damping on the glide ratio, so paper planes swoop for several cycles.',
        },
        {
          kind: 'formula',
          lines: ['T ≈ π √2 · V / g ≈ 0.45 s per m/s'],
          where: 'V is the glide speed and g gravity. A dart at 4.9 m/s swoops about every 2.2 s.',
        },
        { kind: 'diagram', id: 'phugoid', caption: 'An over-fast throw settles into a glide through a few phugoid swoops.' },
      ],
    },
    {
      id: 'trimming',
      heading: 'Practical trimming',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Dives:** add 1 to 3 mm of up-bend at the trailing edges.',
            '**Stalls or porpoises:** remove some up-bend, or move the balance forward.',
            '**Turns left:** raise the right trailing edge a little, or bend the rear of the keel to the right.',
            '**Rolls into a spiral:** add dihedral (5 to 10° each side) or make the keel smaller.',
          ],
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'Small changes',
          text: 'Change one thing at a time and throw gently and level when testing trim. A hard throw hides trim problems inside the phugoid.',
        },
      ],
    },
  ],
  sure: {
    solid: [
      'Static margin, trim and the dihedral effect are textbook flight mechanics.',
      'The phugoid period T = π√2·V/g was confirmed in open course material during the research pass.',
    ],
    calibrated: [
      'The neutral point of short delta wings depends on our centre-of-pressure calibration; the notes flag it as a validation item.',
      'Elevator effectiveness uses thin-aerofoil flap theory scaled for short wings, our calibration.',
    ],
    unverified: [
      'The trimming recipe is consistent with practitioner pages but is model knowledge; those pages carry little evidential weight.',
      'Low-aspect-ratio plates also roll in sideslip without dihedral; the size of that effect was not retrieved.',
    ],
  },
  sources: ['01:S13', '01:S19', '01:S23', '01:S24', '02:S21', '02:S22', '02:S24', '02:S34', '02:S37', '02:S38', '02:S48'],
};
