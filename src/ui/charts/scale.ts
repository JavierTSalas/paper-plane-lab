/** Pure helpers for chart axes: nice tick steps, padded domains and linear scales. */

const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

/** A 1, 2 or 5 x 10^n step that splits `span` into about `count` intervals. */
export function niceStep(span: number, count: number): number {
  const raw = Math.abs(span) / Math.max(1, count);
  if (!Number.isFinite(raw) || raw === 0) return 1;
  const power = Math.floor(Math.log10(raw));
  const error = raw / 10 ** power;
  const factor = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;
  return factor * 10 ** power;
}

/** Decimal places needed to print multiples of `step` exactly. */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

export interface NiceAxis {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** Expand [min, max] outward to whole steps and list the ticks. A flat range is widened around its value. */
export function niceAxis(min: number, max: number, count = 5): NiceAxis {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, count);
  const decimals = stepDecimals(step);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 1e-6; v += step) ticks.push(Number(v.toFixed(decimals)));
  return { min: ticks[0] ?? start, max: ticks[ticks.length - 1] ?? end, step, ticks };
}

/** Ticks inside a fixed domain (no expansion), for axes the caller pins. */
export function ticksWithin(min: number, max: number, count = 5): number[] {
  const step = niceStep(max - min, count);
  const decimals = stepDecimals(step);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-6; v += step) ticks.push(Number(v.toFixed(decimals)));
  return ticks;
}

export type Scale = (v: number) => number;

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** Index of the element of sorted `xs` closest to `x`. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo]! - x) <= Math.abs(xs[hi]! - x) ? lo : hi;
}

/** Default tick label: just enough decimals for the step, true minus sign. */
export function tickLabel(v: number, step: number): string {
  const text = v.toFixed(stepDecimals(step));
  return Number(text) === 0 ? text.replace('-', '') : text.replace('-', '−');
}
