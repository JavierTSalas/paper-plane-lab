/**
 * Allocation-free playback of a precomputed flight, shared by the WebGL stage and the SVG fallback.
 * Same interpolation as `sampleAt` in core/sim, written into a reusable sample.
 */
import type { FlightResult } from '../../../core/types';

/** The flight at one instant. Owned by the player and overwritten every frame: copy what you keep. */
export interface LiveSample {
  t: number;
  pos: [number, number, number];
  quat: [number, number, number, number];
  vel: [number, number, number];
  airspeed: number;
  /** Radians. */
  alpha: number;
  wind: [number, number, number];
}

export function createLiveSample(): LiveSample {
  return { t: 0, pos: [0, 0, 0], quat: [0, 0, 0, 1], vel: [0, 0, 0], airspeed: 0, alpha: 0, wind: [0, 0, 0] };
}

const mix = (a: number, b: number, f: number): number => a + (b - a) * f;

/** Write the flight at time `t` into `out` (clamped to the flight). */
export function sampleInto(result: FlightResult, t: number, out: LiveSample): LiveSample {
  const s = result.samples;
  const n = s.length;
  if (n === 0) return out;
  let i: number;
  let f: number;
  if (!(t > s[0].t)) {
    i = 0;
    f = 0;
  } else if (t >= s[n - 1].t || n === 1) {
    i = Math.max(0, n - 2);
    f = n === 1 ? 0 : 1;
  } else {
    i = Math.min(n - 2, Math.max(0, Math.floor((t - s[0].t) * result.sampleHz)));
    while (i > 0 && s[i].t > t) i--;
    while (i < n - 2 && s[i + 1].t <= t) i++;
    const span = s[i + 1].t - s[i].t;
    f = span > 0 ? (t - s[i].t) / span : 0;
  }
  const a = s[i];
  const b = n === 1 ? a : s[i + 1];
  out.t = Math.min(Math.max(t, s[0].t), s[n - 1].t);
  for (let k = 0; k < 3; k++) {
    out.pos[k] = mix(a.pos[k], b.pos[k], f);
    out.vel[k] = mix(a.vel[k], b.vel[k], f);
    out.wind[k] = mix(a.wind[k], b.wind[k], f);
  }
  out.airspeed = mix(a.airspeed, b.airspeed, f);
  out.alpha = mix(a.alpha, b.alpha, f);
  // Normalised lerp on the shorter arc: indistinguishable from slerp between 120 Hz samples.
  const qa = a.quat;
  const qb = b.quat;
  const sign = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3] < 0 ? -1 : 1;
  let len = 0;
  for (let k = 0; k < 4; k++) {
    const v = mix(qa[k], sign * qb[k], f);
    out.quat[k] = v;
    len += v * v;
  }
  len = Math.sqrt(len) || 1;
  for (let k = 0; k < 4; k++) out.quat[k] /= len;
  return out;
}

/** Duration of a flight, seconds. */
export const flightDuration = (result: FlightResult | null): number => (result && result.samples.length > 0 ? result.samples[result.samples.length - 1].t : 0);

/** Play head: real time in, flight time out. */
export class PlaybackClock {
  t = 0;
  rate = 1;
  playing = false;
  duration = 0;

  /** Advance by `dt` seconds of real time. Returns true on the frame the end is reached. */
  tick(dt: number): boolean {
    if (!this.playing) return false;
    this.t += dt * this.rate;
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.playing = false;
      return true;
    }
    return false;
  }

  reset(duration: number): void {
    this.duration = duration;
    this.t = 0;
    this.playing = false;
  }

  seek(t: number): void {
    this.t = Math.min(Math.max(0, t), this.duration);
  }

  play(): void {
    if (this.duration <= 0) return;
    if (this.t >= this.duration) this.t = 0;
    this.playing = true;
  }
}
