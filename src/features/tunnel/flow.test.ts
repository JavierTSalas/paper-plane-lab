import { describe, expect, it } from 'vitest';
import { circulationFor, flowPicture, inverseJoukowski, joukowski, velocityAt } from './flow';

const DEG = Math.PI / 180;

describe('Joukowski flat plate', () => {
  it('maps the circle onto a plate of chord 1 and inverts outside it', () => {
    const edge = joukowski([0.25, 0]);
    expect(edge[0]).toBeCloseTo(0.5, 12);
    const top = joukowski([0, 0.25]);
    expect(top[0]).toBeCloseTo(0, 12);
    expect(top[1]).toBeCloseTo(0, 12);
    for (const z of [[0.3, 0.2], [-1, 0.5], [0.1, -0.02], [2, -1]] as const) {
      const zeta = inverseJoukowski([z[0], z[1]]);
      expect(Math.hypot(zeta[0], zeta[1])).toBeGreaterThanOrEqual(0.25 - 1e-12);
      const back = joukowski(zeta);
      expect(back[0]).toBeCloseTo(z[0], 9);
      expect(back[1]).toBeCloseTo(z[1], 9);
    }
  });

  it('recovers the free stream far away', () => {
    const v = velocityAt(inverseJoukowski([40, 30]), 10 * DEG, circulationFor(0.8));
    expect(v[0]).toBeCloseTo(Math.cos(10 * DEG), 2);
    expect(v[1]).toBeCloseTo(Math.sin(10 * DEG), 2);
  });

  it('with the Kutta circulation (CL = 2 pi sin alpha) the flow leaves the trailing edge smoothly', () => {
    const alpha = 8 * DEG;
    const cl = 2 * Math.PI * Math.sin(alpha);
    // Just behind the trailing edge on the plate line: finite speed, flowing back along the plate.
    const v = velocityAt(inverseJoukowski([0.50001, 0]), alpha, circulationFor(cl));
    expect(Number.isFinite(v[0])).toBe(true);
    expect(Math.hypot(v[0], v[1])).toBeLessThan(2);
    // Without circulation the flow wraps round the sharp edge and the speed there blows up.
    const w = velocityAt(inverseJoukowski([0.50001, 0]), alpha, 0);
    expect(Math.hypot(w[0], w[1])).toBeGreaterThan(5 * Math.hypot(v[0], v[1]));
  });

  it('traces every streamline across the test section without entering the plate', () => {
    const seeds = Array.from({ length: 15 }, (_, i) => -0.9 + (i * 1.8) / 14);
    for (const alphaDeg of [-8, 0, 6, 18, 40]) {
      const pic = flowPicture({ alphaRad: alphaDeg * DEG, cl: 1.3 * Math.sin(alphaDeg * DEG), stalled: alphaDeg > 30, xMin: -1.6, xMax: 1.6, seeds });
      expect(pic.streamlines).toHaveLength(seeds.length);
      for (const line of pic.streamlines) {
        expect(line[0]![0]).toBeCloseTo(-1.6, 6);
        expect(line[line.length - 1]![0]).toBeGreaterThan(1.5);
        for (const p of line) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
      }
      expect(pic.eddies.length).toBe(alphaDeg > 30 ? 2 : 0);
    }
  });

  it('puts the leading edge up and forward for a positive angle of attack', () => {
    const pic = flowPicture({ alphaRad: 10 * DEG, cl: 0.5, stalled: false, xMin: -1.5, xMax: 1.5, seeds: [0] });
    expect(pic.le[0]).toBeLessThan(0);
    expect(pic.le[1]).toBeGreaterThan(0);
    expect(pic.te[1]).toBeLessThan(0);
  });

  it('lift turns the flow downward behind the plate (downwash)', () => {
    const up = flowPicture({ alphaRad: 6 * DEG, cl: 0.6, stalled: false, xMin: -1.6, xMax: 1.6, seeds: [0.3] }).streamlines[0]!;
    const none = flowPicture({ alphaRad: 0, cl: 0, stalled: false, xMin: -1.6, xMax: 1.6, seeds: [0.3] }).streamlines[0]!;
    const yAt = (l: readonly (readonly [number, number])[], x: number): number => l.reduce((a, p) => (Math.abs(p[0] - x) < Math.abs(a[0] - x) ? p : a))[1];
    expect(yAt(none, 1.2)).toBeCloseTo(0.3, 2);
    // Upwash ahead of the plate, then the stream line is lower than where it came from relative to the upwash peak.
    expect(yAt(up, -0.2)).toBeGreaterThan(yAt(up, 1.2));
  });
});
