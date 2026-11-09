import { describe, expect, it } from 'vitest';
import { meterState } from './BarMeter';
import { valueAt } from './LineChart';

describe('valueAt', () => {
  const pts = [
    [0, 0],
    [1, 10],
    [3, 30],
  ] as const;

  it('interpolates between neighbours on either side of the nearest point', () => {
    expect(valueAt(pts, 0.5)).toBeCloseTo(5);
    expect(valueAt(pts, 1.4)).toBeCloseTo(14);
    expect(valueAt(pts, 2.9)).toBeCloseTo(29);
  });

  it('hits the samples exactly and is null outside the range', () => {
    expect(valueAt(pts, 3)).toBe(30);
    expect(valueAt(pts, -0.1)).toBeNull();
    expect(valueAt(pts, 3.1)).toBeNull();
    expect(valueAt([], 1)).toBeNull();
  });
});

describe('meterState', () => {
  it('classifies against an inclusive good band', () => {
    expect(meterState(4, [5, 15])).toBe('low');
    expect(meterState(5, [5, 15])).toBe('good');
    expect(meterState(15, [5, 15])).toBe('good');
    expect(meterState(16, [5, 15])).toBe('high');
  });
});
