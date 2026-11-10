/**
 * Everything Professor Wren says in the intro. Warm, exact, brief: every line stays under 140 characters
 * (checked by the tests).
 */
import type { DiagnosisCode } from '../../core/types';

export const HELLO = {
  title: 'Welcome to the lab.',
  text: "I'm Professor Wren. Every great aircraft starts as a flat sheet.",
  sub: 'Two short demonstrations, then you fold and throw your own. It takes about three minutes.',
};

export const WATCH_FOLD = {
  title: 'Watch my hands.',
  intro: 'Five flat folds, then we give it shape. This is the Classic Dart.',
  /** One line per tutorial segment of the Classic Dart: five flat folds, then half, wings, open. */
  steps: [
    'A crease down the middle first. Every other fold is measured from this line.',
    'Top corner down to the centre line. Crisp creases make a crisper plane.',
    'And its twin. Both halves must match, or the plane turns.',
    'Now the slanted edge in to the centre. The nose gets narrower and heavier.',
    'Same on the right. See how the paper piles up near the nose?',
    'Fold it in half along that first crease. It becomes the keel, the plane’s spine.',
    'Each wing folds down, its edge laid along the keel.',
    'Open the wings until they sit nearly flat. Done.',
  ],
  why: 'Most of the paper ends up near the nose. A heavy nose keeps it pointing where it is going.',
};

export const WATCH_THROW = {
  title: 'Now, the throw.',
  ready: 'The classroom air is still, so only the plane decides the flight. A gentle, level push.',
  flying: 'Off it goes. Watch the nose.',
  clean: 'It flew straight and level: weight in the nose, lift on the wings, perfectly balanced.',
  otherwise: 'Not my best throw. Every flight tells you something.',
};

export const YOUR_FOLD = {
  title: 'Your turn.',
  pick: 'Pick your paper. Any colour flies the same, but this one is yours.',
  /** Indexed by flat folds finished. */
  progress: [
    'The centre crease first, like I did. Take your time; paper is patient.',
    'Good crease. Now the corners.',
    'Neatly done. Keep the edges right on the centre line.',
    'Halfway. You fold like you have done this before.',
    'One more. Then we give it shape.',
  ],
  shaping: 'That is a Classic Dart. In half, wings down, and open.',
};

export const YOUR_THROW = {
  title: 'Throw it.',
  ready: 'Swipe up on the room, or set speed and angle below. Gentle is fine.',
  flying: 'Watch the nose…',
  beat: 'Further than mine. I may have let you win.',
  close: 'Neck and neck with mine.',
  short: 'Shorter than mine. That is useful.',
  again: 'Try a different speed or angle and compare.',
};

export const GRADUATE = {
  title: 'You’re a lab member now.',
  text: 'Your dart is waiting in the hangar. Where to next?',
  nameLabel: 'Your name, for the rankings',
  nameHint: 'Optional. Shown next to your ranked flights.',
};

export const SKIP_LABEL = 'Skip intro';

/** How the player's flight compares with the Professor's, by distance. Within 10 % counts as the same. */
export function compareLine(mine: number, wren: number): string {
  if (mine > wren * 1.1) return YOUR_THROW.beat;
  if (mine >= wren * 0.9) return YOUR_THROW.close;
  return YOUR_THROW.short;
}

/** A short, kind headline for each diagnosis, in the Professor's voice. The details come from the simulator. */
export const DIAGNOSIS_HEADLINE: Record<DiagnosisCode, string> = {
  'clean-glide': 'A clean glide. That is exactly what a dart should do.',
  'nose-dive': 'It dived. The nose won the argument with the wings.',
  'stall-mush': 'It stalled: the nose rose until the wings stopped lifting.',
  porpoise: 'It bobbed up and down, like a dolphin. Too much speed for its trim.',
  loop: 'A loop. Lovely to watch, terrible for distance.',
  spiral: 'It curved into a spiral. One wing was doing more work than the other.',
  'roll-off': 'It rolled to one side and slid away.',
  tumble: 'It tumbled. Too fast or too steep for this little dart.',
  'wind-carried': 'The wind carried it along.',
  'hit-wall': 'It reached the far wall. The classroom is the limit, not your arm.',
  'hit-ceiling': 'It hit the ceiling. Throw softer or flatter indoors.',
  'too-slow': 'Too slow to fly: the wings need some speed to lift.',
  ballistic: 'It flew like a stone, not a plane. Too hard a throw for paper.',
};
