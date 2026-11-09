import type { Topic } from './types';

export interface RecordRow {
  category: 'distance' | 'airtime';
  /** Metres for distance, seconds for airtime. */
  value: number;
  who: string;
  when: string;
  note?: string;
  /** `established`: consistent across the notes and their sources. `reported`: a newer claim the notes could not verify. */
  status: 'established' | 'reported';
  sources: string[];
}

/** Record marks as given in docs/research/02 §6.2 and 04 §6. */
export const RECORDS: RecordRow[] = [
  {
    category: 'distance',
    value: 98.43,
    who: 'Liu Liwen and team (China)',
    when: 'Shanghai, 28 Dec 2025',
    note: 'Reported in 2026; design and paper not published.',
    status: 'reported',
    sources: ['04:S28', '04:S37', '02:S2'],
  },
  {
    category: 'distance',
    value: 88.31,
    who: 'Dillon Ruble, Garrett Jensen and Nathaniel Erickson (USA)',
    when: 'Crown Point, Indiana, 2 Dec 2022',
    note: 'A4 at 100 g/m², launched at about 40°.',
    status: 'established',
    sources: ['04:S28', '04:S42', '04:S44'],
  },
  {
    category: 'distance',
    value: 69.14,
    who: 'Joe Ayoob (thrower) and John M. Collins (designer)',
    when: 'McClellan, California, 26 Feb 2012',
    note: 'The “Suzanne” glider, one uncut A4 sheet.',
    status: 'established',
    sources: ['04:S45', '04:S46', '02:S7'],
  },
  {
    category: 'airtime',
    value: 31.2,
    who: 'Seven-person team (China)',
    when: 'Kunshan, 11 Feb 2026',
    note: 'Reported in 2026; design and paper not published.',
    status: 'reported',
    sources: ['04:S29', '04:S40', '02:S3'],
  },
  {
    category: 'airtime',
    value: 29.2,
    who: 'Takuo Toda (Japan)',
    when: 'Fukuyama, 19 Dec 2010',
    status: 'established',
    sources: ['04:S29', '04:S41', '02:S3'],
  },
  {
    category: 'airtime',
    value: 27.6,
    who: 'Ken Blackburn (USA)',
    when: 'Atlanta, 8 Oct 1998',
    note: 'Thrown nearly straight up, at about 60 mph.',
    status: 'established',
    sources: ['04:S47', '02:S9'],
  },
];

export const records: Topic = {
  id: 'records',
  title: 'Records and arenas',
  summary: 'The real distance and time-aloft records, how competitions measure them, and how the lab’s arenas copy those rules.',
  icon: 'ranks',
  tone: 'mustard',
  sections: [
    {
      id: 'records',
      heading: 'The records',
      blocks: [
        {
          kind: 'p',
          text: 'There are two classic records: how far a paper plane flies, and how long it stays up. They reward opposite designs. Distance planes are slim darts thrown hard and flat at about 40°. Time-aloft planes are broad gliders hurled nearly straight up, so they can float down slowly from the roof.',
        },
        {
          kind: 'formula',
          lines: ['t ≈ t_climb + h / w'],
          where: 'Time aloft is roughly the climb plus the glide down from peak height h at average sink rate w.',
          info: { label: 'What sink rate do records imply?', text: 'The notes estimate a peak of about 18 m for record time-aloft throws. Then 29.2 s implies an average sink near 0.7 m/s, turns included (a derived estimate).' },
        },
        { kind: 'widget', id: 'records' },
        {
          kind: 'callout',
          tone: 'caveat',
          title: 'Newer marks',
          text: 'The research notes report a 98.43 m distance (December 2025) and 31.2 s time aloft (February 2026). They rest on news and search-result text the notes could not open, so we mark them **reported, not verified here**. The 88.31 m, 69.14 m, 29.2 s and 27.6 s marks are well established.',
        },
      ],
    },
    {
      id: 'rules',
      heading: 'How competitions measure',
      blocks: [
        {
          kind: 'list',
          items: [
            '**One sheet.** At most A4 and 100 g/m². Red Bull Paper Wings allows folding only; Guinness allows one small piece of tape.',
            '**Indoors, still air.** Both bodies require it, so the weather cannot help.',
            '**Hand throw from behind a line.** Stepping over the line voids the throw. Red Bull also bans a run-up; the notes found no such rule for Guinness.',
            '**First touch ends the flight.** Distance runs from the launch line to the first point where the plane touches the floor or anything else. Time runs from leaving the hand to that first touch. Sliding further does not count.',
          ],
        },
        { kind: 'diagram', id: 'arena', caption: 'A distance throw in a hall: measured from the launch line to the first touch, not to where the plane comes to rest.' },
      ],
    },
    {
      id: 'arenas',
      heading: 'The lab’s arenas',
      blocks: [
        {
          kind: 'p',
          text: 'Ranked throws in the lab copy these rules. Every arena fixes its air, indoors and still, caps the throw speed so nobody can launch faster than a strong human arm, and measures distance and time to the first touch of floor, wall or ceiling. Each ranked flight is stored with everything needed to fly it again, and is re-flown to check it.',
        },
        {
          kind: 'p',
          text: 'The planes on the boards include the lab’s own benchmark flights of the preset designs, clearly labelled. No board contains made-up players.',
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Lab numbers are not records',
          text: 'The real records need a record throw, a record design and record folding. The lab can teach you why those planes fly so far, but a lab score is a simulation, not a measurement.',
        },
      ],
    },
  ],
  sure: {
    solid: [
      'The 88.31 m (2022), 69.14 m (2012), 29.2 s (2010) and 27.6 s (1998) marks agree across the notes and their sources.',
      'Red Bull’s first-touch measurement and folding-only rule are quoted from its rules page (via search-result text).',
    ],
    calibrated: [
      'The arena throw-speed cap and fixed indoor air are our design choices, modelled on competition rules.',
    ],
    unverified: [
      'The 98.43 m and 31.2 s marks: reported, not verified here.',
      'Guinness does not publish its full guidelines; whether it measures to first touch is our assumption.',
      'Launch angles and speeds of record throws are approximate.',
    ],
  },
  sources: ['02:S1', '02:S3', '02:S7', '02:S9', '02:S11', '04:S28', '04:S29', '04:S31', '04:S32', '04:S33', '04:S37', '04:S40', '04:S41', '04:S42', '04:S44', '04:S45', '04:S46', '04:S47', '08:S31'],
};
