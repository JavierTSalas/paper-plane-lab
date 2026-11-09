/**
 * Steady-glide detection on the output samples (docs/research/02-flight-dynamics-validation.md section 8).
 */
import { DEG } from '../math';
import type { FlightSample } from '../types';

/** A steady glide must last at least this long, seconds (task brief; doc 02 section 8 asks for 1 s on long flights). */
export const STEADY_MIN_DURATION = 0.5;
/** Within the window the airspeed stays inside this fraction of its lowest value (design choice). */
export const STEADY_SPEED_BAND = 0.05;
/** Within the window the flight-path angle through the air stays inside this band, radians (design choice). */
export const STEADY_ANGLE_BAND = 2.5 * DEG;

export interface SteadyGlide {
  /** Index of the first and last sample of the window. */
  from: number;
  to: number;
  /** Horizontal distance through the air / height lost through the air. null when it did not descend. */
  glideRatio: number | null;
  /** Mean sink rate through the air, m/s. */
  sinkRate: number;
  /** Mean angle of attack, radians. */
  alpha: number;
  /** Mean airspeed, m/s. */
  speed: number;
}

/**
 * The longest stretch of the flight in which airspeed and flight-path angle (both relative to the air) stay
 * within the steady bands, or null when no stretch lasts STEADY_MIN_DURATION. One pass with two monotonic
 * queues per signal.
 */
export function findSteadyGlide(samples: readonly FlightSample[]): SteadyGlide | null {
  const n = samples.length;
  if (n < 2) return null;
  const speed = new Float64Array(n);
  const angle = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    speed[i] = s.airspeed;
    angle[i] = s.airspeed > 1e-9 ? Math.asin(Math.max(-1, Math.min(1, (s.vel[1] - s.wind[1]) / s.airspeed))) : 0;
  }
  // Monotonic index queues: front = extreme of the current window.
  const maxV = new Int32Array(n);
  const minV = new Int32Array(n);
  const maxA = new Int32Array(n);
  const minA = new Int32Array(n);
  let maxVh = 0, maxVt = 0, minVh = 0, minVt = 0, maxAh = 0, maxAt = 0, minAh = 0, minAt = 0;
  let from = 0;
  let bestFrom = -1;
  let bestTo = -1;
  let bestDuration = 0;
  for (let to = 0; to < n; to++) {
    while (maxVt > maxVh && speed[maxV[maxVt - 1]] <= speed[to]) maxVt--;
    maxV[maxVt++] = to;
    while (minVt > minVh && speed[minV[minVt - 1]] >= speed[to]) minVt--;
    minV[minVt++] = to;
    while (maxAt > maxAh && angle[maxA[maxAt - 1]] <= angle[to]) maxAt--;
    maxA[maxAt++] = to;
    while (minAt > minAh && angle[minA[minAt - 1]] >= angle[to]) minAt--;
    minA[minAt++] = to;
    // Shrink from the left until the window is steady again.
    while (
      speed[maxV[maxVh]] - speed[minV[minVh]] > STEADY_SPEED_BAND * speed[minV[minVh]] ||
      angle[maxA[maxAh]] - angle[minA[minAh]] > STEADY_ANGLE_BAND
    ) {
      from++;
      if (maxV[maxVh] < from) maxVh++;
      if (minV[minVh] < from) minVh++;
      if (maxA[maxAh] < from) maxAh++;
      if (minA[minAh] < from) minAh++;
    }
    const duration = samples[to].t - samples[from].t;
    if (duration > bestDuration) {
      bestDuration = duration;
      bestFrom = from;
      bestTo = to;
    }
  }
  if (bestFrom < 0 || bestDuration < STEADY_MIN_DURATION) return null;

  // Trapezoid sums over the window, all relative to the air.
  let run = 0;
  let drop = 0;
  let alpha = 0;
  let speedSum = 0;
  for (let i = bestFrom; i < bestTo; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const dt = b.t - a.t;
    const ha = Math.hypot(a.vel[0] - a.wind[0], a.vel[2] - a.wind[2]);
    const hb = Math.hypot(b.vel[0] - b.wind[0], b.vel[2] - b.wind[2]);
    run += 0.5 * (ha + hb) * dt;
    drop -= 0.5 * (a.vel[1] - a.wind[1] + b.vel[1] - b.wind[1]) * dt;
    alpha += 0.5 * (a.alpha + b.alpha) * dt;
    speedSum += 0.5 * (a.airspeed + b.airspeed) * dt;
  }
  return {
    from: bestFrom,
    to: bestTo,
    glideRatio: drop > 1e-9 ? run / drop : null,
    sinkRate: drop / bestDuration,
    alpha: alpha / bestDuration,
    speed: speedSum / bestDuration,
  };
}
