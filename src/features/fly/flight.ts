/**
 * Pure helpers of the flight screen: labels, throw mapping, seeds, trails. No DOM, no three.
 */
import { THROW_LIMITS } from '../../core/sim';
import type { Conditions, Environment, FlightResult, Launch, Vec3 } from '../../core/types';

export type ArmStrength = 'gentle' | 'firm' | 'hard' | 'athlete';

/** Words for the release speed (bands from THROW_LIMITS: casual 5-11 m/s, strong 15, elite 27). */
export function armStrength(speed: number): ArmStrength {
  if (speed < 6) return 'gentle';
  if (speed <= THROW_LIMITS.casualMaxSpeed) return 'firm';
  if (speed < 20) return 'hard';
  return 'athlete';
}

export const ARM_LABEL: Record<ArmStrength, string> = { gentle: 'Gentle', firm: 'Firm', hard: 'Hard', athlete: 'Athlete' };

/** Beaufort number and name for a mean wind speed in m/s (WMO scale, upper bounds of each force). */
const BEAUFORT: readonly [number, string][] = [
  [0.5, 'Calm'],
  [1.5, 'Light air'],
  [3.3, 'Light breeze'],
  [5.5, 'Gentle breeze'],
  [7.9, 'Moderate breeze'],
  [10.7, 'Fresh breeze'],
  [13.8, 'Strong breeze'],
];

export function beaufort(speed: number): { force: number; name: string } {
  for (let i = 0; i < BEAUFORT.length; i++) if (speed < BEAUFORT[i][0]) return { force: i, name: BEAUFORT[i][1] };
  return { force: BEAUFORT.length, name: 'Near gale' };
}

/** Normalise degrees into [0, 360). */
export const wrapDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Plain words for a wind blowing TOWARD `towardDeg` (0 = with the throw, 180 = into the thrower's face,
 * 90 = toward +z, the thrower's right, so it comes from the left).
 */
export function windDirectionLabel(towardDeg: number): string {
  const d = wrapDeg(towardDeg);
  const from = d > 0 && d < 180 ? 'left' : 'right';
  if (d <= 22.5 || d >= 337.5) return 'Tailwind';
  if (d >= 157.5 && d <= 202.5) return 'Headwind';
  if ((d > 67.5 && d < 112.5) || (d > 247.5 && d < 292.5)) return `Crosswind from the ${from}`;
  if (d < 90 || d > 270) return `Quartering tailwind from the ${from}`;
  return `Quartering headwind from the ${from}`;
}

/** Is the air still and repeatable here (indoors), so the same throw should give the same flight? */
export function isStillAir(env: Environment): boolean {
  return env.indoor;
}

/** Fixed seed for still indoor air, so a repeated throw repeats exactly. */
export const STILL_AIR_SEED = 1;

/** A seed for the next throw: fixed indoors, fresh outdoors (`random` in [0, 1)). */
export function nextSeed(env: Environment, random: number): number {
  return isStillAir(env) ? STILL_AIR_SEED : 1 + Math.floor(random * 2_147_483_646);
}

/** The conditions of a throw in an environment: only adjustable environments carry the wind settings. */
export function conditionsFor(env: Environment, wind: { speed: number; towardDeg: number; gustiness: number }): Conditions {
  if (!env.adjustableWind) return { envId: env.id };
  return { envId: env.id, windSpeed: wind.speed, windTowardDeg: wind.towardDeg, gustiness: wind.gustiness };
}

/* ------------------------------------------------------------------ swipe to throw */

/** Swipe speed (screen heights per second) to release speed, m/s. One quick flick of half a screen is a firm throw. */
const SWIPE_SPEED_GAIN = 4.5;
/** Shortest swipe that counts as a throw, px. */
export const MIN_SWIPE_PX = 36;

/**
 * Map a swipe to a throw. `dx`, `dy` = screen displacement (y down) of the stroke, `vx`, `vy` = release
 * velocity in px/s, `screenH` = the stage height in px.
 *
 * A straight swipe up throws slightly upward (about 22 degrees); leaning the swipe to either side flattens it
 * (a 45-degree diagonal is a little below level). The plane's heading keeps the yaw setting.
 */
export function swipeToThrow(dx: number, dy: number, vx: number, vy: number, screenH: number): { speed: number; pitchDeg: number } | null {
  if (Math.hypot(dx, dy) < MIN_SWIPE_PX || dy >= 0) return null;
  const up = -dy;
  const elevation = Math.atan2(up, Math.abs(dx)) * (180 / Math.PI);
  const pitchDeg = clamp(Math.round(0.7 * (elevation - 65) + 5), THROW_LIMITS.minPitchDeg, 60);
  // Release velocity along the stroke.
  const along = Math.max(0, (vx * dx + vy * dy) / Math.hypot(dx, dy));
  const screens = along / Math.max(200, screenH);
  const speed = clamp(Math.round((THROW_LIMITS.minSpeed + screens * SWIPE_SPEED_GAIN) * 10) / 10, THROW_LIMITS.minSpeed, THROW_LIMITS.maxSpeed);
  return { speed, pitchDeg };
}

/* ------------------------------------------------------------------ trails */

/** CG path of a flight thinned to about `hz` points per second, for ghost trails. */
export function trailOf(result: FlightResult, hz = 20): Vec3[] {
  const stride = Math.max(1, Math.round(result.sampleHz / hz));
  const out: Vec3[] = [];
  const s = result.samples;
  for (let i = 0; i < s.length; i += stride) out.push(s[i].pos);
  if (s.length > 0 && (s.length - 1) % stride !== 0) out.push(s[s.length - 1].pos);
  return out;
}

export const MAX_GHOSTS = 3;

/** Newest trail first, at most MAX_GHOSTS. */
export function pushGhost(ghosts: readonly Vec3[][], trail: Vec3[]): Vec3[][] {
  return [trail, ...ghosts].slice(0, MAX_GHOSTS);
}

/** The launch with every field clamped into the throw control ranges. */
export function clampLaunch(l: Launch): Launch {
  return {
    speed: clamp(l.speed, THROW_LIMITS.minSpeed, THROW_LIMITS.maxSpeed),
    pitchDeg: clamp(l.pitchDeg, THROW_LIMITS.minPitchDeg, THROW_LIMITS.maxPitchDeg),
    yawDeg: clamp(l.yawDeg, -30, 30),
    rollDeg: clamp(l.rollDeg, -THROW_LIMITS.maxRollDeg, THROW_LIMITS.maxRollDeg),
    aoaDeg: l.aoaDeg,
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Downrange distance of a point from the release point, metres. */
export const downrangeOf = (pos: Vec3, launch: Vec3): number => Math.hypot(pos[0] - launch[0], pos[2] - launch[2]);
