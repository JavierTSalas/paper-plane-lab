import { describe, expect, it } from 'vitest';
import { linearScale, nearestIndex, niceAxis, niceStep, stepDecimals, tickLabel, ticksWithin } from './scale';

describe('nice ticks', () => {
  it('picks 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(37, 5)).toBe(10);
    expect(niceStep(1.5, 4)).toBe(0.5);
    expect(niceStep(0.06, 5)).toBeCloseTo(0.01, 12);
  });

  it('expands the domain to whole steps', () => {
    expect(niceAxis(0, 10, 5).ticks).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceAxis(0, 37, 5).ticks).toEqual([0, 10, 20, 30, 40]);
    const a = niceAxis(-0.3, 1.2, 4);
    expect(a.ticks).toEqual([-0.5, 0, 0.5, 1, 1.5]);
    expect([a.min, a.max]).toEqual([-0.5, 1.5]);
  });

  it('has no floating point noise', () => {
    const { ticks } = niceAxis(0, 0.7, 7);
    expect(ticks).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  });

  it('widens a flat range and survives bad input', () => {
    expect(niceAxis(5, 5).ticks.length).toBeGreaterThan(1);
    expect(niceAxis(0, 0).ticks).toContain(0);
    expect(niceAxis(Number.NaN, 3).ticks.length).toBeGreaterThan(1);
  });

  it('lists ticks inside a pinned domain', () => {
    expect(ticksWithin(-10, 60, 7)).toEqual([-10, 0, 10, 20, 30, 40, 50, 60]);
    expect(ticksWithin(0.15, 0.95, 4)).toEqual([0.2, 0.4, 0.6, 0.8]);
  });
});

describe('helpers', () => {
  it('decimals and labels', () => {
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.01)).toBe(2);
    expect(stepDecimals(20)).toBe(0);
    expect(tickLabel(-0.5, 0.5)).toBe('−0.5');
    expect(tickLabel(-0, 1)).toBe('0');
  });

  it('linear scale maps and inverts direction', () => {
    const s = linearScale([0, 10], [100, 0]);
    expect(s(0)).toBe(100);
    expect(s(5)).toBe(50);
    expect(s(10)).toBe(0);
  });

  it('nearest index by binary search', () => {
    const xs = [0, 1, 2, 4, 8];
    expect(nearestIndex(xs, -3)).toBe(0);
    expect(nearestIndex(xs, 2.9)).toBe(2);
    expect(nearestIndex(xs, 3.1)).toBe(3);
    expect(nearestIndex(xs, 100)).toBe(4);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});
