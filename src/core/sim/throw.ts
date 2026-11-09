/**
 * The human throw: control ranges and starting values.
 * Source: docs/research/02-flight-dynamics-validation.md section 5 ("Recommended control ranges").
 */
import { RELEASE_HEIGHT } from '../env';
import type { Launch, PlaneCategory } from '../types';

export const THROW_LIMITS = {
  /** Release speed range of the throw control, m/s (doc 02 section 5: 2 - 30 m/s). */
  minSpeed: 2,
  maxSpeed: 30,
  /** Default throw, m/s (doc 02 section 5: default 7 m/s). */
  typicalSpeed: 7,
  /** What most people manage: 5 - 11 m/s (doc 02 section 5, [S31][S32]). */
  casualMinSpeed: 5,
  casualMaxSpeed: 11,
  /** A strong amateur, m/s (doc 02 section 5: "strong" 15 m/s). */
  strongSpeed: 15,
  /** An elite time-aloft launch, m/s (doc 02 section 5: about 27 m/s, [S11]). */
  eliteSpeed: 27,
  /** Launch angle range, degrees above the horizon (doc 02 section 5: -20 to +90). */
  minPitchDeg: -20,
  maxPitchDeg: 90,
  /** Bank error at release, degrees either way (doc 02 section 5: roll misalignment +-20 deg). */
  maxRollDeg: 20,
  /** Release height of an adult's overhand throw, metres, and the range from child to tall adult (doc 02 section 5). */
  releaseHeight: RELEASE_HEIGHT,
  minReleaseHeight: 0.8,
  maxReleaseHeight: 2.3,
  /** Above this speed real paper may deform, m/s (doc 02 section 5). */
  deformSpeed: 20,
} as const;

/**
 * A sensible first throw for a kind of plane: darts want a firm, slightly raised throw, gliders a gentle
 * level push (speeds inside the casual 5 - 11 m/s band of doc 02 section 5; the split by category is a
 * design choice). The nose points along the throw.
 */
export function defaultLaunch(category?: PlaneCategory): Launch {
  let speed: number = THROW_LIMITS.typicalSpeed;
  let pitchDeg = 5;
  switch (category) {
    case 'dart':
      speed = 8;
      break;
    case 'glider':
    case 'wing':
      speed = 5;
      pitchDeg = 0;
      break;
    case 'hybrid':
    case 'custom':
    case undefined:
      break;
  }
  return { speed, pitchDeg, yawDeg: 0, rollDeg: 0, aoaDeg: 0 };
}
