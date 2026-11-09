import { describe, expect, it } from 'vitest';
import type { TrimAnalysis } from '../../core/types';
import { lateralStatements, trimAdvice } from './advice';
import { levelState } from './Readouts';

const base: TrimAnalysis = {
  trimmable: true, alphaDeg: 8, cl: 0.4, speed: 4, glideRatio: 5, sinkRate: 0.8, neutralPointX: 0.1, staticMarginPct: 10,
  pitchStable: true, clBeta: -0.05, cnBeta: -0.01, rollStable: true, yawStable: true, cnBetaDynamic: 0.02,
  bestLd: 5.2, bestLdAlphaDeg: 7, stallAlphaDeg: 30,
};

describe('trim advice', () => {
  it('reads each regime', () => {
    expect(trimAdvice(base, [], 'metric').title).toBe('Nicely balanced');
    expect(trimAdvice({ ...base, pitchStable: false, staticMarginPct: -4 }, [], 'metric').text).toMatch(/forward/);
    const noTrim = { ...base, trimmable: false, alphaDeg: null, speed: null };
    expect(trimAdvice(noTrim, [{ alphaDeg: 0, cl: 0, cd: 0.02, cm: -0.01, ld: 0 }], 'metric').title).toMatch(/dive/);
    expect(trimAdvice(noTrim, [{ alphaDeg: 0, cl: 0, cd: 0.02, cm: 0.02, ld: 0 }], 'metric').title).toMatch(/stall/);
    expect(trimAdvice({ ...base, staticMarginPct: 2 }, [], 'metric').title).toMatch(/just/);
    expect(trimAdvice({ ...base, alphaDeg: 15 }, [], 'metric').text).toMatch(/take out/);
    expect(trimAdvice({ ...base, alphaDeg: 8 }, [], 'imperial').text).toMatch(/mph/);
  });

  it('states lateral stability from the signs', () => {
    expect(lateralStatements(base).roll).toMatch(/steady/);
    expect(lateralStatements({ ...base, rollStable: false }).roll).toMatch(/unsteady/);
    expect(lateralStatements({ ...base, yawStable: false, cnBetaDynamic: -0.1 }).yaw).toMatch(/unsteady/);
  });

  it('calls lift within 5 % of weight level', () => {
    expect(levelState(0.049, 0.05)).toBe('level');
    expect(levelState(0.06, 0.05)).toBe('climb');
    expect(levelState(0.03, 0.05)).toBe('sink');
  });
});
