import type { Topic } from './types';

export const howItWorks: Topic = {
  id: 'how-it-works',
  title: 'How the lab works',
  summary: 'The simulation in five steps, from a folded sheet to a flight through moving air, and what it leaves out.',
  icon: 'sparkle',
  tone: 'accent',
  sections: [
    {
      id: 'five-steps',
      heading: 'Five steps from sheet to flight',
      blocks: [
        {
          kind: 'p',
          text: 'Every flight in the lab starts from the same place you do: a flat sheet. Nothing about your plane is typed in by hand. Its weight, its balance and the way air pushes on it all come out of the folds.',
        },
        { kind: 'diagram', id: 'sim-pipeline', caption: 'The five stages. Each one only uses what the stage before it produced.' },
        {
          kind: 'list',
          items: [
            '**Fold geometry.** Each fold reflects part of the paper across a straight line and stacks it on top or underneath. The lab keeps every layer as an exact polygon, then opens the result into 3D along the keel, wing and winglet lines. See [[folding]].',
            '**Mass and centre of gravity.** Paper is conserved by folding, so the mass is simply sheet area times paper weight: an A4 sheet of 80 g/m² paper is {{mass:0.00499|2}}. The centre of gravity and the inertia are summed exactly over every layer.',
            '**Flat-plate elements.** The wings, keel and winglets are sliced into thin strips. Each strip is treated as a small flat plate with its own angle to the airflow. Layers that overlap count once.',
            '**Forces and motion.** At every tiny time step, each strip reports a push normal to its surface plus a little skin friction. Adding them up gives one force and one twisting moment, and the plane moves as a rigid body in all six ways a body can move: three directions, three rotations.',
            '**Wind.** Each strip feels its own velocity relative to the air, so a gust that hits one wing first really does roll the plane. Indoors the air is nearly still; outdoors the lab adds a wind profile, turbulence, gusts, thermals and slope lift. See [[wind]].',
          ],
        },
        {
          kind: 'p',
          text: 'Turning and wobbling damp themselves out naturally: a spinning wing moves its strips through the air, and the strips push back. The lab also adds the mass of the air a light sheet drags along with it, which is surprisingly large for something this flimsy.',
        },
        {
          kind: 'formula',
          lines: ['u = v + ω × r − wind', 'F = ½ ρ |u|² S · C_N(α)'],
          where: 'u is the strip’s velocity through the air, r its position from the centre of gravity, S its area, ρ the air density and C_N the normal-force coefficient at angle α.',
          info: { label: 'Why is the force normal to the strip?', text: 'A sharp, thin plate cannot hold the suction a rounded nose would, so the pressure force acts straight out of the surface. [[lift-and-drag|Lift and drag]] explains why.' },
        },
      ],
    },
    {
      id: 'what-it-ignores',
      heading: 'What it leaves out',
      blocks: [
        {
          kind: 'p',
          text: 'A good model is honest about its edges. These are the big ones, and each could change a real flight:',
        },
        {
          kind: 'list',
          items: [
            '**Paper flex.** Every panel is rigid. Real single-layer wings sag and twist, most of all during a hard throw. This is the largest gap between the lab and your desk. See [[paper~flex|why real paper flexes]].',
            '**Crease relaxation.** Real folds slowly spring open, so trim drifts over minutes. Your folds here stay exactly where you put them.',
            '**Ground effect.** Close to the floor a real wing gains a little lift and loses some drag. The lab does not model it, so very low skimming glides end a touch early.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Same throw, same flight',
          text: 'The simulation is deterministic: the same plane, throw, air and random seed always give the same flight. That is what lets the ranks re-fly a throw to check it.',
        },
      ],
    },
  ],
  sure: {
    solid: [
      'Folding geometry, mass, centre of gravity and inertia are exact arithmetic on the folded layers.',
      'Rigid-body motion and summing forces over strips are standard flight-dynamics methods.',
    ],
    calibrated: [
      'The strip force curves, the centre-of-pressure travel and the added-air mass are our calibration from the research notes, tuned to trends rather than to a measured polar for each plane.',
    ],
    unverified: [
      'The notes could not open most of the original papers behind the force model; its numbers rest on search-result text, derivations and model knowledge.',
      'No paper plane in the lab has yet been checked against a measured flight of the same fold.',
    ],
  },
  sources: ['01:S14', '01:S15', '01:S23', '02:S12', '02:S15', '02:S16', '02:S20', '07:S1', '07:S3'],
};
