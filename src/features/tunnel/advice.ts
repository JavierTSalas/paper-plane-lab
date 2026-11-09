/** The Professor's reading of the trim and stability numbers, in plain words. */
import type { PolarPoint, TrimAnalysis } from '../../core/types';
import type { ProfessorPose } from '../../ui/Professor';
import { fixed, formatSpeed, type UnitSystem } from '../../ui/format';

export interface Advice {
  pose: ProfessorPose;
  title: string;
  text: string;
}

/** Static margin band (% MAC) the stability meter calls good: doc 02 section 4 gives ~7.5 % as typical. */
export const MARGIN_GOOD: readonly [number, number] = [5, 25];

/** Degrees between the trim angle and the best-glide angle that count as "close enough". */
const GLIDE_SLACK_DEG = 3;

export function trimAdvice(trim: TrimAnalysis, polar: readonly PolarPoint[], units: UnitSystem): Advice {
  if (!trim.pitchStable) {
    return {
      pose: 'think',
      title: 'It will not hold its nose steady',
      text:
        'The neutral point sits ahead of the balance point, so any bump in pitch grows instead of settling. ' +
        'Move the weight forward: fold the nose over once more, or slide a paper clip onto the nose.',
    };
  }
  if (!trim.trimmable || trim.alphaDeg === null || trim.speed === null) {
    const cm0 = polar.find((p) => p.alphaDeg === 0)?.cm ?? 0;
    return cm0 <= 0
      ? {
          pose: 'point',
          title: 'Stable, but it will dive',
          text:
            'The nose is too heavy for the trim: the plane never finds an angle where it balances with lift to spare. ' +
            'Bend both trailing edges up a few degrees (more elevator) until a trim point appears.',
        }
      : {
          pose: 'point',
          title: 'It noses up all the way to the stall',
          text:
            'There is so much up elevator that the plane only balances beyond the stall, so it will climb, stall and drop. ' +
            'Flatten the trailing edges a little, or add a touch of nose weight.',
        };
  }
  const margin = trim.staticMarginPct;
  const glide = `${formatSpeed(trim.speed, units)}, travelling ${fixed(trim.glideRatio ?? 0, 1)} times as far forward as it drops`;
  if (margin < MARGIN_GOOD[0]) {
    return {
      pose: 'think',
      title: 'Only just stable',
      text: `A static margin of ${fixed(margin, 0)} % leaves little to pull the nose back, so expect it to porpoise. A little nose weight will calm it; then add a touch of elevator to keep the trim.`,
    };
  }
  if (margin > MARGIN_GOOD[1]) {
    return {
      pose: 'talk',
      title: 'Very stable, a little stiff',
      text: `It settles at ${fixed(trim.alphaDeg, 0)}° and glides at ${glide}. So much margin needs a lot of elevator; less nose weight would let it float.`,
    };
  }
  let tune = 'It sits close to its best glide angle, so leave the trim alone.';
  if (trim.alphaDeg > trim.bestLdAlphaDeg + GLIDE_SLACK_DEG) {
    tune = `That is past its best glide angle of ${fixed(trim.bestLdAlphaDeg, 0)}°: take out a little elevator for a flatter glide.`;
  } else if (trim.alphaDeg < trim.bestLdAlphaDeg - GLIDE_SLACK_DEG) {
    tune = `Its best glide is at ${fixed(trim.bestLdAlphaDeg, 0)}°: a touch more elevator flattens the glide.`;
  }
  return {
    pose: 'cheer',
    title: 'Nicely balanced',
    text: `It settles at ${fixed(trim.alphaDeg, 0)}° and glides at ${glide}. ${tune}`,
  };
}

/** One plain sentence each for roll and yaw stability. */
export function lateralStatements(trim: TrimAnalysis): { roll: string; yaw: string } {
  const roll = trim.rollStable
    ? 'Roll: steady. When it slips sideways, the wing facing the wind rises and levels it.'
    : 'Roll: unsteady. A sideways slip tips it further over; a little dihedral (wing tips up) would help.';
  let yaw: string;
  if (trim.yawStable) yaw = 'Yaw: steady. Like a weathervane, the nose turns back into the wind.';
  else if (trim.cnBetaDynamic > 0) yaw = 'Yaw: the keel alone does not weathervane, but in a glide the roll response holds the heading.';
  else yaw = 'Yaw: unsteady. The nose wanders off line; a deeper keel or small upturned winglets help.';
  return { roll, yaw };
}
