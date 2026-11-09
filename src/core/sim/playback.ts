/**
 * Smooth playback of a finished flight at any frame rate.
 */
import { quatSlerp } from '../math';
import type { FlightResult, FlightSample, Vec3 } from '../types';

const mix = (a: number, b: number, f: number): number => a + (b - a) * f;
const mix3 = (a: Vec3, b: Vec3, f: number): Vec3 => [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)];

/** Interpolate an angle along the shorter way round. */
function mixAngle(a: number, b: number, f: number): number {
  let d = b - a;
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * f;
}

/**
 * The flight at time `t`: linear between the two neighbouring samples, spherical for the attitude.
 * Times before the release or after the end return the first or last sample.
 */
export function sampleAt(result: FlightResult, t: number): FlightSample {
  const samples = result.samples;
  const n = samples.length;
  if (n === 0) throw new Error('sampleAt: the flight has no samples');
  if (!(t > samples[0].t)) return samples[0];
  if (t >= samples[n - 1].t) return samples[n - 1];
  // Samples are evenly spaced except the last one; start the search from the even-spacing guess.
  let i = Math.min(n - 2, Math.max(0, Math.floor((t - samples[0].t) * result.sampleHz)));
  while (i > 0 && samples[i].t > t) i--;
  while (i < n - 2 && samples[i + 1].t <= t) i++;
  const a = samples[i];
  const b = samples[i + 1];
  const span = b.t - a.t;
  const f = span > 0 ? (t - a.t) / span : 0;
  return {
    t,
    pos: mix3(a.pos, b.pos, f),
    quat: quatSlerp(a.quat, b.quat, f),
    vel: mix3(a.vel, b.vel, f),
    omega: mix3(a.omega, b.omega, f),
    airspeed: mix(a.airspeed, b.airspeed, f),
    alpha: mixAngle(a.alpha, b.alpha, f),
    beta: mix(a.beta, b.beta, f),
    cl: mix(a.cl, b.cl, f),
    cd: mix(a.cd, b.cd, f),
    wind: mix3(a.wind, b.wind, f),
  };
}
