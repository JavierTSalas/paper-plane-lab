import type { Topic } from './types';

export const wind: Topic = {
  id: 'wind',
  title: 'Wind',
  summary: 'Wind is slower near the ground, never steady, and sometimes rises. A paper plane feels all of it, which is why records are set indoors.',
  icon: 'wind',
  tone: 'sky',
  sections: [
    {
      id: 'profile',
      heading: 'Slower near the ground',
      blocks: [
        {
          kind: 'p',
          text: 'The ground drags on the air above it, so wind speed grows with height. Weather reports quote wind at 10 m. At the height you throw from, it is noticeably less. Over open grass the lab uses the standard logarithmic profile:',
        },
        {
          kind: 'formula',
          lines: ['U(z) = U₁₀ · ln(z / z₀) / ln(10 m / z₀)'],
          where: 'z is height, U₁₀ the wind at 10 m and z₀ the roughness length of the ground, about 0.03 m for open grass.',
          info: { label: 'How much slower at 2 m?', text: 'Over grass, the wind at 2 m is about 0.72 of the 10 m value. Rougher ground slows it more.' },
        },
        { kind: 'diagram', id: 'wind-profile', caption: 'Wind over open grass: fast aloft, slower near the ground. The arrows show speed at each height.' },
      ],
    },
    {
      id: 'gusts',
      heading: 'Turbulence and gusts',
      blocks: [
        {
          kind: 'p',
          text: 'Outdoor wind is never steady. The lab adds random **turbulence** with the statistics of air near the ground, plus occasional **gusts** that ramp up and fade. Near the ground over grass, the strongest 3-second gust in ten minutes is typically about 1.6 times the average wind.',
        },
        {
          kind: 'p',
          text: 'A paper plane is light and slow, so a gust changes its angle of attack a lot. A 0.3 m/s updraft tilts the airflow by about 3° for a plane at 6 m/s, but a quarter of a degree for an airliner. By the notes’ estimate, paper is tens of times more gust-sensitive than an airliner.',
        },
        {
          kind: 'formula',
          lines: ['Δα ≈ w / V'],
          where: 'w is the vertical gust speed and V the airspeed (angle in radians).',
        },
      ],
    },
    {
      id: 'rising-air',
      heading: 'Thermals and slope lift',
      blocks: [
        {
          kind: 'p',
          text: 'Sunlit ground warms air that rises in **thermals**. Near the ground they are weak, perhaps half a metre per second at 2 m, but a paper plane only sinks at about 0.5 to 1 m/s, so a thermal can hold it up. Wind blowing onto a hill or cliff is forced upward too: that is **slope lift**, and it can be stronger, a metre or two per second in front of a cliff.',
        },
        { kind: 'diagram', id: 'slope-lift', caption: 'Rising air: a thermal bubble over warm ground, and wind deflected upward by a slope.' },
      ],
    },
    {
      id: 'indoors',
      heading: 'Why records are set indoors',
      blocks: [
        {
          kind: 'p',
          text: 'Air in an occupied room drifts at roughly 0.05 to 0.2 m/s, a few percent of a plane’s speed. Outdoors, even a light breeze brings turbulence and gusts many times larger. Both Guinness and Red Bull Paper Wings call for indoor, still-air venues, so a record measures the plane and the throw rather than the weather. The lab’s ranked arenas follow suit; see [[records]].',
        },
        {
          kind: 'callout',
          tone: 'tip',
          title: 'Throwing in wind',
          text: 'Your throw speed is relative to the ground. Into a headwind the plane starts with more airspeed and may loop; with a tailwind it starts slower and may stall.',
        },
      ],
    },
  ],
  sure: {
    solid: [
      'The log wind profile and the gust angle Δα ≈ w/V are standard; the 0.72 factor at 2 m over grass is arithmetic.',
      'Air density and viscosity follow the US Standard Atmosphere and Sutherland’s law.',
    ],
    calibrated: [
      'Mixing near-ground turbulence intensities with military-standard length scales is a pragmatic choice in the notes; clamps near the ground are engineering judgement.',
      'Thermal and ridge-lift fields are simplified idealisations scaled to paper-plane size.',
    ],
    unverified: [
      'The exact turbulence spectra, thermal-model constants and gust factors rest on search extracts and model knowledge; no source was opened in full.',
      'Typical indoor air speeds are model knowledge, not measurements of a particular room.',
    ],
  },
  sources: ['03:S1', '03:S4', '03:S8', '03:S10', '03:S11', '03:S14', '03:S21', '03:S22', '03:S24', '03:S28', '03:S32', '03:S33', '04:S31', '04:S32'],
};
