import type { Topic } from './types';

export const glossary: Topic = {
  id: 'glossary',
  title: 'Glossary',
  summary: 'Every word the lab uses, in a sentence or two, with a labelled plane to point at.',
  icon: 'edit',
  tone: 'plum',
  sections: [
    {
      id: 'parts',
      heading: 'Parts of a paper plane',
      blocks: [
        { kind: 'diagram', id: 'plane-parts', caption: 'A dart from above and from the front, with the names the lab uses.' },
        {
          kind: 'terms',
          items: [
            { term: 'Nose', def: 'The front tip, usually many layers thick. Its weight pulls the centre of gravity forward.' },
            { term: 'Keel (fuselage)', def: 'The folded body hanging below the wings. It gives you something to hold and acts like a fin.' },
            { term: 'Wing', def: 'The broad surfaces either side of the keel that make most of the lift.' },
            { term: 'Leading edge / trailing edge', def: 'The front and rear edges of a wing.' },
            { term: 'Elevator', def: 'The rear strip of the wings, bent up or down together to set the trim. Bent in opposite directions, the same strips act as ailerons and roll the plane.' },
            { term: 'Winglet', def: 'A tip folded up or down at the end of a wing. It adds directional stability.' },
            { term: 'Rudder', def: 'The rear of the keel, bent sideways to make the plane turn.' },
          ],
        },
      ],
    },
    {
      id: 'flight-words',
      heading: 'Flight words',
      blocks: [
        {
          kind: 'terms',
          items: [
            { term: 'Angle of attack', def: 'The angle between the wing and the oncoming air. See [[lift-and-drag]].' },
            { term: 'Lift and drag', def: 'The parts of the air’s push across and along the flight path.' },
            { term: 'Glide ratio (L/D)', def: 'Metres flown forward for each metre lost in height in still air; about 4 to 6 for paper.' },
            { term: 'Sink rate', def: 'How fast a gliding plane loses height, in metres per second.' },
            { term: 'Stall', def: 'When the angle of attack is too high for the flow to follow the wing, so lift stops growing and drag jumps.' },
            { term: 'Aspect ratio', def: 'Span squared divided by wing area. Long, slender wings have a high aspect ratio; darts are near 1.' },
            { term: 'Wing loading', def: 'Weight divided by wing area. Lower wing loading means a slower, floatier glide.' },
            { term: 'Centre of gravity (CG)', def: 'The balance point of the whole plane.' },
            { term: 'Neutral point', def: 'The point where extra lift acts when the angle of attack changes. See [[stability-and-trim]].' },
            { term: 'Static margin', def: 'How far the centre of gravity sits ahead of the neutral point, as a fraction of the wing chord.' },
            { term: 'Trim', def: 'The steady angle of attack, and speed, that a plane settles into on its own.' },
            { term: 'Dihedral', def: 'Wings tipped up into a shallow “Y” seen from the front. It helps the plane roll level.' },
            { term: 'Phugoid', def: 'A slow swooping trade of height for speed and back.' },
            { term: 'Reynolds number', def: 'A number comparing the air’s momentum with its stickiness. See [[reynolds]].' },
          ],
        },
      ],
    },
    {
      id: 'paper-words',
      heading: 'Paper and folding words',
      blocks: [
        {
          kind: 'terms',
          items: [
            { term: 'Grammage', def: 'Mass of one square metre of paper, such as 80 g/m².' },
            { term: 'Valley / mountain fold', def: 'A fold that comes toward you (valley) or goes away (mountain). See [[folding]].' },
            { term: 'Crease', def: 'A line folded and unfolded, to mark a reference for later folds.' },
            { term: 'Flap', def: 'The layers that move together in one fold.' },
            { term: 'First touch', def: 'The moment a flight ends in competition and in the lab: the first contact with floor, wall or anything else.' },
          ],
        },
      ],
    },
  ],
  sure: {
    solid: ['The definitions are standard aeronautical and origami usage.'],
    calibrated: ['The typical values quoted (glide ratio 4 to 6, darts near aspect ratio 1) come from the lab’s own model and the research notes.'],
    unverified: ['The glide ratio of real paper planes rests on one measured dart the research could not read in full.'],
  },
  sources: ['01:S29', '02:S12', '07:S16'],
};
