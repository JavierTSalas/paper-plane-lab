/**
 * Thermal updrafts: Allen (2006) scaling with height and the zero-net-flux game shape.
 * Model: docs/research/03-wind-atmosphere.md section 5.2.
 */
import type { ThermalSpec } from '../types';

/** Mean updraft w_bar = w* (z/z_i)^(1/3) (1 - 1.1 z/z_i) (doc 03 section 5.2, [S29]). */
const MEAN_TOP_FACTOR = 1.1;
/** Outer radius r2 = max(10 m, 0.102 (z/z_i)^(1/3) (1 - 0.25 z/z_i) z_i) (doc 03 section 5.2). */
const R2_FLOOR = 10;
const R2_FACTOR = 0.102;
const R2_TOP_FACTOR = 0.25;
/** Core ratio r1/r2 = 0.0011 r2 + 0.14 below r2 = 600 m, else 0.8 (doc 03 section 5.2). */
const CORE_SLOPE_PER_M = 0.0011;
const CORE_BASE = 0.14;
const CORE_WIDE_R2 = 600;
const CORE_WIDE_RATIO = 0.8;

/** Outer radius r2 of the updraft at a height above the ground, metres. Also the radius R of the game shape. */
export function thermalRadius(spec: ThermalSpec, height: number): number {
  const zi = spec.mixedLayerHeight;
  if (!(height > 0) || !(zi > 0)) return R2_FLOOR;
  const rel = height / zi;
  return Math.max(R2_FLOOR, R2_FACTOR * Math.cbrt(rel) * (1 - R2_TOP_FACTOR * rel) * zi);
}

/** Peak (core) updraft at a height above the ground, m/s. Zero at the ground and above the convective layer. */
export function thermalPeak(spec: ThermalSpec, height: number): number {
  const zi = spec.mixedLayerHeight;
  if (!(height > 0) || !(zi > 0)) return 0;
  const rel = height / zi;
  const mean = spec.wStar * Math.cbrt(rel) * (1 - MEAN_TOP_FACTOR * rel);
  if (mean <= 0) return 0;
  const r2 = thermalRadius(spec, height);
  const ratio = r2 < CORE_WIDE_R2 ? CORE_SLOPE_PER_M * r2 + CORE_BASE : CORE_WIDE_RATIO;
  // w_peak = 3 w_bar (r2^3 - r2^2 r1) / (r2^3 - r1^3), written with the ratio r1 / r2.
  return (3 * mean * (1 - ratio)) / (1 - ratio * ratio * ratio);
}

/**
 * Vertical air speed of a thermal at horizontal distance `r` from its centre, m/s:
 * w = w_peak exp(-(r/R)^2) (1 - (r/R)^2) with R = r2. Updraft inside R, a weak sink ring outside, zero net flux.
 */
export function thermalUpdraft(spec: ThermalSpec, height: number, r: number): number {
  const peak = thermalPeak(spec, height);
  if (peak === 0) return 0;
  const radius = thermalRadius(spec, height);
  const x = (r * r) / (radius * radius);
  return peak * Math.exp(-x) * (1 - x);
}
