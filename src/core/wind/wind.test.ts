import { describe, expect, it } from 'vitest';
import { getEnvironment, terrainHeight } from '../env';
import { createRng } from '../math';
import type { Environment, Vec3, WindSpec } from '../types';
import {
  airFrom, createWindField, drydenLengthU, drydenOutput, frictionVelocity, lengthScaleHeight, resolveWind, stepDryden, stepOu,
  thermalPeak, thermalRadius, thermalUpdraft,
} from './index';

const within = (value: number, expected: number, fraction: number): void => {
  expect(Math.abs(value - expected)).toBeLessThanOrEqual(fraction * Math.abs(expected));
};

const meadow = getEnvironment('meadow');
const hill = getEnvironment('hill');
const cliff = getEnvironment('cliff');
const classroom = getEnvironment('classroom');

/** Steady wind of a spec: no gusts, no thermals, turbulence as given. */
const steady = (spec: WindSpec, more: Partial<WindSpec> = {}): WindSpec => ({ ...spec, gustiness: 0, thermals: [], ...more });

describe('air (doc 03 section 1.3)', () => {
  it('reproduces the density and viscosity table', () => {
    const dry = (t: number) => airFrom(t, 101_325, 0);
    const wet = (t: number) => airFrom(t, 101_325, 1);
    within(dry(0).rho, 1.2923, 1e-4);
    within(dry(15).rho, 1.225, 1e-4);
    within(dry(20).rho, 1.2041, 1e-4);
    within(dry(30).rho, 1.1644, 1e-4);
    within(wet(20).rho, 1.1936, 1e-4);
    within(wet(35).rho, 1.1215, 1e-4);
    within(dry(0).mu, 1.716e-5, 1e-3);
    within(dry(15).mu, 1.789e-5, 1e-3);
    within(dry(20).mu, 1.813e-5, 1e-3);
    within(dry(35).mu, 1.884e-5, 1e-3);
    within(airFrom(4.5, 83_431, 0).rho, 1.0467, 2e-4);
  });

  it('gives the air of the environments (doc 03 section 8)', () => {
    const table: Record<string, [number, number]> = {
      classroom: [1.1956, 1.818e-5],
      gym: [1.2082, 1.804e-5],
      meadow: [1.1813, 1.833e-5],
      hill: [1.2203, 1.789e-5],
      cliff: [1.2142, 1.794e-5],
    };
    for (const [id, [rho, mu]] of Object.entries(table)) {
      const env = getEnvironment(id);
      const air = airFrom(env.tempC, env.pressurePa, env.humidity);
      within(air.rho, rho, 2e-4);
      within(air.mu, mu, 1e-3);
    }
  });
});

describe('resolveWind', () => {
  it('applies the player\'s settings where the wind is adjustable, clamped to the place\'s limits', () => {
    const w = resolveWind(meadow, { envId: 'meadow', windSpeed: 4, windTowardDeg: 135, gustiness: 0.2 });
    expect(w.speed).toBe(4);
    expect(w.towardDeg).toBe(135);
    expect(w.gustiness).toBe(0.2);
    expect(w.roughness).toBe(meadow.wind.roughness);
    expect(resolveWind(meadow, { envId: 'meadow', windSpeed: 50 }).speed).toBe(meadow.maxWind);
    expect(resolveWind(meadow, { envId: 'meadow', windSpeed: -3 }).speed).toBe(0);
    expect(resolveWind(meadow, { envId: 'meadow', gustiness: 7 }).gustiness).toBe(1);
    expect(resolveWind(meadow, { envId: 'meadow' })).toEqual(meadow.wind);
  });

  it('ignores them indoors', () => {
    expect(resolveWind(classroom, { envId: 'classroom', windSpeed: 5, windTowardDeg: 90, gustiness: 1 })).toBe(classroom.wind);
  });
});

describe('mean wind', () => {
  it('follows the log law: U(2 m) / U10 = 0.723 over grass, 0.851 over water (doc 03 section 2.2)', () => {
    const grass = createWindField(steady(meadow.wind, { speed: 5, towardDeg: 0 }), 1, meadow);
    const at = (h: number): number => grass.mean([0, h, 0], 0)[0];
    within(at(10), 5, 1e-9);
    within(at(2) / at(10), 0.723, 2e-3);
    within(at(1) / at(10), 0.604, 2e-3);
    within(at(3) / at(10), 0.793, 2e-3);
    within(at(6.1) / at(10), 0.915, 2e-3);
    const flatSea: Environment = { ...cliff, terrain: { kind: 'flat' } };
    const sea = createWindField(steady(cliff.wind, { speed: 5, towardDeg: 0 }), 1, flatSea);
    within(sea.mean([0, 2, 0], 0)[0] / 5, 0.851, 2e-3);
    within(sea.mean([0, 1, 0], 0)[0] / 5, 0.787, 2e-3);
  });

  it('blows toward the stated direction and is level over flat ground', () => {
    for (const deg of [0, 90, 180, 250]) {
      const f = createWindField(steady(meadow.wind, { speed: 3, towardDeg: deg }), 1, meadow);
      const w = f.mean([4, 10, -2], 0);
      expect(w[0]).toBeCloseTo(3 * Math.cos((deg * Math.PI) / 180), 9);
      expect(w[2]).toBeCloseTo(3 * Math.sin((deg * Math.PI) / 180), 9);
      expect(w[1]).toBe(0);
    }
  });

  it('is at rest on the ground and below it, and rises continuously from it', () => {
    const f = createWindField(steady(meadow.wind, { speed: 6, towardDeg: 0 }), 3, meadow);
    expect(f.mean([0, 0, 0], 0)).toEqual([0, 0, 0]);
    expect(f.mean([0, -1, 0], 0)).toEqual([0, 0, 0]);
    expect(f.sample([0, -0.5, 0], 0)).toEqual([0, 0, 0]);
    let prev = 0;
    for (let h = 0.005; h < 3; h += 0.005) {
      const u = f.mean([0, h, 0], 0)[0];
      expect(u).toBeGreaterThanOrEqual(prev);
      expect(u - prev).toBeLessThan(0.2);
      prev = u;
    }
  });

  it('is uniform indoors, with no flow through walls, floor or ceiling and none outside the room', () => {
    const b = classroom.bounds!;
    const f = createWindField(steady(classroom.wind, { towardDeg: 30, turbulence: null }), 1, classroom);
    const mid = f.mean([3, 1.5, 0], 0);
    expect(Math.hypot(mid[0], mid[2])).toBeCloseTo(0.05, 12);
    expect(f.mean([1, 1.2, 1], 0)).toEqual(mid);
    expect(f.mean([b.xMax, 1.5, 0], 0)[0]).toBeCloseTo(0, 12);
    expect(f.mean([b.xMin, 1.5, 0], 0)[0]).toBeCloseTo(0, 12);
    expect(f.mean([3, 1.5, b.zMax], 0)[2]).toBeCloseTo(0, 12);
    expect(f.mean([3, 1.5, b.zMin], 0)[2]).toBeCloseTo(0, 12);
    expect(f.mean([b.xMax + 0.1, 1.5, 0], 0)).toEqual([0, 0, 0]);
    expect(f.mean([3, b.ceiling + 0.1, 0], 0)).toEqual([0, 0, 0]);
    // With turbulence too: the vertical component vanishes at the floor and the ceiling.
    const gusty = createWindField(classroom.wind, 5, classroom);
    for (let i = 0; i < 200; i++) {
      const t = i * 0.01;
      expect(gusty.sample([3, 0, 0], t)[1]).toBeCloseTo(0, 12);
      expect(gusty.sample([3, b.ceiling, 0], t)[1]).toBeCloseTo(0, 12);
      expect(gusty.sample([b.xMax, 1, 0], t)[0]).toBeCloseTo(0, 12);
    }
  });

  it('draws the direction of a room draft from the seed', () => {
    const a = createWindField(steady(classroom.wind, { turbulence: null }), 1, classroom).mean([3, 1.5, 0], 0);
    const b = createWindField(steady(classroom.wind, { turbulence: null }), 2, classroom).mean([3, 1.5, 0], 0);
    const again = createWindField(steady(classroom.wind, { turbulence: null }), 1, classroom).mean([3, 1.5, 0], 0);
    expect(again).toEqual(a);
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(1e-3);
    expect(Math.hypot(a[0], a[2])).toBeCloseTo(Math.hypot(b[0], b[2]), 12);
  });
});

describe('terrain flow', () => {
  it('hill: about 0.9 m/s of lift at 2 m on the steepest slope in a 4.5 m/s wind, 29 % speed-up at the crest (doc 03 section 5.3 a)', () => {
    if (hill.terrain.kind !== 'hill') throw new Error('hill terrain expected');
    const { crestX, halfWidth } = hill.terrain;
    // Wind toward +x: the windward slope is behind the crest.
    const f = createWindField(steady(hill.wind, { speed: 4.5, towardDeg: 0 }), 1, hill);
    const above = (x: number, h: number): Vec3 => [x, terrainHeight(hill.terrain, x) + h, 0];
    const steep = crestX - halfWidth / 2;
    within(f.mean(above(steep, 2), 0)[1], 0.94, 0.03);
    within(f.mean(above(steep, 5), 0)[1], 1.0, 0.03);
    // Lee slope: the same sink.
    within(f.mean(above(crestX + halfWidth / 2, 2), 0)[1], -0.94, 0.03);
    const flat = createWindField(steady(hill.wind, { speed: 4.5, towardDeg: 0 }), 1, { ...hill, terrain: { kind: 'flat' } });
    within(f.mean(above(crestX, 2), 0)[0] / flat.mean([0, 2, 0], 0)[0], 1.29, 0.01);
    expect(f.mean(above(crestX, 2), 0)[1]).toBeCloseTo(0, 9);
    // A wind along the ridges is not deflected.
    const along = createWindField(steady(hill.wind, { speed: 4.5, towardDeg: 90 }), 1, hill);
    expect(along.mean(above(steep, 2), 0)[1]).toBeCloseTo(0, 9);
  });

  it('hill: the default wind (up the slope, in the thrower\'s face) lifts the air where the thrower stands', () => {
    const f = createWindField(steady(hill.wind), 1, hill);
    const w = f.mean([3, terrainHeight(hill.terrain, 3) + 2, 0], 0);
    expect(w[0]).toBeLessThan(0);
    expect(w[1]).toBeGreaterThan(0.3);
  });

  it('cliff: lift of U (R/r)² along the 45 degree diagonal out from the face (doc 03 section 5.3 b)', () => {
    if (cliff.terrain.kind !== 'cliff') throw new Error('cliff terrain expected');
    const R = cliff.terrain.height;
    const sea = terrainHeight(cliff.terrain, 1e3);
    const f = createWindField(steady(cliff.wind, { speed: 4, towardDeg: 180 }), 1, cliff);
    const flatSea = createWindField(steady(cliff.wind, { speed: 4, towardDeg: 180 }), 1, { ...cliff, terrain: { kind: 'flat' } });
    for (const out of [10, 15, 19]) {
      const r = R + out;
      const x = cliff.terrain.edgeX + r * Math.SQRT1_2;
      const eta = r * Math.SQRT1_2;
      const w = f.mean([x, sea + eta, 0], 0);
      // The profile speed is the upstream speed of this streamline, which came in at height eta (1 - R²/r²).
      const upstream = -flatSea.mean([0, eta * (1 - (R * R) / (r * r)), 0], 0)[0];
      within(w[1], upstream * (R / r) ** 2, 1e-9);
      // On this diagonal the horizontal wind is the undisturbed one.
      within(-w[0], upstream, 1e-9);
      // Doc values (2.2, 1.7, 1.4 m/s with 4.34 m/s at cliff-top height) within the difference of profile heights.
      within(w[1], 4.34 * (R / r) ** 2, 0.12);
    }
  });

  it('cliff: the air is at rest inside the rock, flows along the face and is continuous across the edge', () => {
    if (cliff.terrain.kind !== 'cliff') throw new Error('cliff terrain expected');
    const { edgeX, height } = cliff.terrain;
    const f = createWindField(steady(cliff.wind, { speed: 4, towardDeg: 180 }), 1, cliff);
    for (const x of [edgeX - 20, edgeX - 1, edgeX + 0.5, edgeX + 10, edgeX + 24, edgeX + 60]) {
      const ground = terrainHeight(cliff.terrain, x);
      expect(f.mean([x, ground - 0.2, 0], 0)).toEqual([0, 0, 0]);
      expect(f.mean([x, ground, 0], 0).every((c) => Math.abs(c) < 1e-9)).toBe(true);
    }
    // Just above the face the flow follows it: no component into the rock.
    for (const x of [edgeX + 5, edgeX + 12, edgeX + 20]) {
      const out = x - edgeX;
      const normal: [number, number] = [out / height, Math.sqrt(1 - (out / height) ** 2)];
      const w = f.mean([x + normal[0] * 0.5, terrainHeight(cliff.terrain, x) + normal[1] * 0.5, 0], 0);
      const speed = Math.hypot(w[0], w[1]);
      expect(speed).toBeGreaterThan(0.5);
      expect(Math.abs(w[0] * normal[0] + w[1] * normal[1]) / speed).toBeLessThan(0.05);
      expect(w[1]).toBeGreaterThan(0);
    }
    const top = terrainHeight(cliff.terrain, edgeX);
    for (const h of [0.5, 2, 8]) {
      const before = f.mean([edgeX - 1e-6, top + h, 0], 0);
      const after = f.mean([edgeX + 1e-6, top + h, 0], 0);
      for (let i = 0; i < 3; i++) expect(after[i]).toBeCloseTo(before[i], 4);
    }
    // Onshore wind is slowed in the separation zone on the cliff top; an offshore wind is not.
    const inZone: Vec3 = [edgeX - 0.5 * height, top + 2, 0];
    const offshore = createWindField(steady(cliff.wind, { speed: 4, towardDeg: 0 }), 1, cliff);
    within(Math.abs(f.mean(inZone, 0)[0]), 0.5 * Math.abs(offshore.mean(inZone, 0)[0]), 1e-9);
  });
});

describe('thermals (doc 03 section 5.2)', () => {
  const spec = { x: 0, z: 0, wStar: 1.5, mixedLayerHeight: 1000 };

  it('reproduces the Allen table: peak updraft and radius against height', () => {
    const table: [number, number, number][] = [[1, 0.38, 10.2], [2, 0.48, 12.8], [5, 0.65, 17.4], [10, 0.81, 21.9], [20, 1.0, 27.5]];
    for (const [z, peak, r2] of table) {
      within(thermalPeak(spec, z), peak, 0.02);
      within(thermalRadius(spec, z), r2, 0.01);
    }
    expect(thermalPeak(spec, 0)).toBe(0);
    expect(thermalPeak(spec, -1)).toBe(0);
  });

  it('has the game shape: peak in the core, zero at R = r2, strongest sink 0.135 of the peak at 1.41 R, zero net flux', () => {
    const z = 5;
    const R = thermalRadius(spec, z);
    const peak = thermalPeak(spec, z);
    expect(thermalUpdraft(spec, z, 0)).toBeCloseTo(peak, 12);
    expect(thermalUpdraft(spec, z, R)).toBeCloseTo(0, 12);
    within(thermalUpdraft(spec, z, Math.SQRT2 * R), -0.1353 * peak, 1e-3);
    let flux = 0;
    let lift = 0;
    const dr = R / 2000;
    for (let r = dr / 2; r < 8 * R; r += dr) {
      const w = thermalUpdraft(spec, z, r) * 2 * Math.PI * r * dr;
      flux += w;
      if (w > 0) lift += w;
    }
    expect(Math.abs(flux)).toBeLessThan(1e-6 * lift);
  });

  it('the meadow\'s thermal lifts the air over its centre and drifts downwind with the profile', () => {
    const th = meadow.wind.thermals[0];
    const f = createWindField({ ...meadow.wind, gustiness: 0 }, 1, meadow);
    within(f.mean([th.x, 2, th.z], 0)[1], thermalPeak(th, 2), 1e-9);
    expect(f.mean([th.x, 0, th.z], 0)[1]).toBe(0);
    // After 10 s the core at 2 m has moved by U(2 m) * 10 s toward +x.
    const u2 = f.mean([-200, 2, 0], 0)[0];
    within(u2, 1.08, 0.01);
    within(f.mean([th.x + u2 * 10, 2, th.z], 10)[1], thermalPeak(th, 2), 1e-9);
    expect(f.mean([th.x, 2, th.z], 10)[1]).toBeLessThan(0.9 * thermalPeak(th, 2));
  });
});

describe('turbulence recurrences (doc 03 section 3.4)', () => {
  it('Dryden scales and similarity intensities match the tables', () => {
    within(drydenLengthU(lengthScaleHeight(2, 0.03)), 15.4, 0.005);
    within(drydenLengthU(lengthScaleHeight(10, 0.03)), 67.4, 0.005);
    within(drydenLengthU(lengthScaleHeight(30, 0.03)), 152, 0.005);
    // Clamps: 1 m floor, 10 z0 floor, 300 m ceiling.
    expect(lengthScaleHeight(0.2, 0.03)).toBe(1);
    expect(lengthScaleHeight(0.2, 0.25)).toBe(2.5);
    expect(lengthScaleHeight(900, 0.03)).toBe(300);
    within(frictionVelocity(1.5, 0.03), 0.103, 0.01);
    within(frictionVelocity(4.5, 0.03), 0.31, 0.01);
    within(frictionVelocity(4, 0.0002), 0.148, 0.01);
    expect(frictionVelocity(4, 0)).toBe(0);
  });

  it('the OU step keeps unit variance and exp(-x) correlation at any step size', () => {
    const rng = createRng(11);
    for (const x of [0.001, 0.05, 0.6, 3]) {
      let s = rng.gauss();
      let sum2 = 0;
      let lag = 0;
      const n = 400_000;
      for (let i = 0; i < n; i++) {
        const next = stepOu(s, x, rng.gauss());
        sum2 += next * next;
        lag += next * s;
        s = next;
      }
      // The estimates tighten with the number of independent stretches, n x / 2.
      const tolerance = Math.max(0.01, 4 / Math.sqrt(n * Math.min(x, 1)));
      within(sum2 / n, 1, tolerance);
      expect(Math.abs(lag / n - Math.exp(-x))).toBeLessThan(tolerance);
    }
  });

  it('the two-state step keeps unit variance and the autocorrelation (1 - xi/2L) exp(-xi/L), including the series branch', () => {
    const rng = createRng(12);
    for (const tau of [0.0005, 0.05, 0.3, 2]) {
      const state = new Float64Array([rng.gauss(), rng.gauss()]);
      const n = 600_000;
      const lagSteps = Math.max(1, Math.round(0.6 / tau));
      const ring = new Float64Array(lagSteps);
      let sum2 = 0;
      let lag = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        stepDryden(state, 0, tau, rng.gauss(), rng.gauss());
        const y = drydenOutput(state, 0);
        sum2 += y * y;
        if (i >= lagSteps) {
          lag += y * ring[i % lagSteps];
          count++;
        }
        ring[i % lagSteps] = y;
      }
      const xi = lagSteps * tau;
      const tolerance = Math.max(0.012, 4 / Math.sqrt(n * Math.min(tau, 1)));
      within(sum2 / n, 1, tolerance);
      expect(Math.abs(lag / count - (1 - xi / 2) * Math.exp(-xi))).toBeLessThan(tolerance);
    }
  });
});

/** Variance and integral length scale of the three gust components along a straight, level path. */
function gustStatistics(spec: WindSpec, env: Environment, seed: number, height: number, speed: number, step: number, count: number, maxLag: number) {
  const f = createWindField(spec, seed, env);
  const dt = step / speed;
  const lags = Math.round(maxLag / step);
  const series = [new Float64Array(count), new Float64Array(count), new Float64Array(count)];
  const mean = f.mean([0, height, 0], 0);
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    // Fly across the wind along z so that the mean wind does not change the sampling distance much; the path
    // is far from the walls of any room (open-air environments only).
    f.sample([0, height, i * step], i * dt, out);
    for (let c = 0; c < 3; c++) series[c][i] = out[c] - mean[c];
  }
  return series.map((s) => {
    let variance = 0;
    for (let i = 0; i < count; i++) variance += s[i] * s[i];
    variance /= count;
    // Integral scale: trapezoid sum of the autocorrelation.
    let scale = 0;
    for (let k = 0; k <= lags; k++) {
      let c = 0;
      for (let i = 0; i + k < count; i++) c += s[i] * s[i + k];
      c /= (count - k) * variance;
      scale += (k === 0 || k === lags ? 0.5 : 1) * c * step;
    }
    return { sigma: Math.sqrt(variance), scale };
  });
}

describe('turbulence of a wind field over a long run', () => {
  it('outdoors: sigma from similarity theory and Dryden length scales, within 10 %', () => {
    // Meadow at U10 = 1.5 m/s: 0.25 / 0.20 / 0.13 m/s and 15.4 / 15.4 / 2.0 m at 2 m (doc 03 section 8).
    const spec = steady(meadow.wind, { speed: 1.5, towardDeg: 0 });
    const uStar = frictionVelocity(1.5, 0.03);
    // u and v: long scales, so a long path in coarse steps. The plane flies fast across a light wind, so the
    // distance through the air is the step to within 0.2 %.
    const [u, , v] = gustStatistics(spec, meadow, 21, 2, 30, 1, 400_000, 120);
    within(u.sigma, 2.4 * uStar, 0.1);
    within(v.sigma, 1.9 * uStar, 0.1);
    within(u.sigma, 0.25, 0.1);
    within(v.sigma, 0.2, 0.1);
    // Integral scales: L_u for the first-order u filter, L_v / 2 for the second-order transverse filter.
    within(u.scale, 15.4 * (1 - Math.exp(-120 / 15.4)), 0.1);
    within(v.scale, 15.4 / 2, 0.1);
    // w: a 2 m scale needs fine steps.
    const [, w] = gustStatistics(spec, meadow, 22, 2, 30, 0.2, 400_000, 16);
    within(w.sigma, 1.25 * uStar, 0.1);
    within(w.sigma, 0.13, 0.1);
    within(w.scale, 2 / 2, 0.1);
  }, 30_000);

  it('indoors: the explicit sigmas and the OU length on every axis, within 10 %', () => {
    // A room big enough that the path never comes near a wall.
    const hall: Environment = { ...classroom, bounds: { xMin: -1e6, xMax: 1e6, zMin: -1e6, zMax: 1e7, ceiling: 100 } };
    const spec = steady(classroom.wind, { speed: 0, towardDeg: 0 });
    const [u, w, v] = gustStatistics(spec, hall, 23, 50, 5, 0.1, 400_000, 8);
    within(u.sigma, 0.04, 0.1);
    within(v.sigma, 0.04, 0.1);
    within(w.sigma, 0.03, 0.1);
    for (const c of [u, v, w]) within(c.scale, 1 * (1 - Math.exp(-8)), 0.1);
  }, 30_000);

  it('vertical gusts fade to nothing at the ground', () => {
    const f = createWindField(steady(hill.wind, { speed: 6, towardDeg: 0 }), 4, { ...hill, terrain: { kind: 'flat' } });
    let high = 0;
    let low = 0;
    for (let i = 0; i < 20_000; i++) {
      high += Math.abs(f.sample([i * 0.05, 5, 0], i * 0.01)[1]);
      low += Math.abs(f.sample([i * 0.05, 0.05, 0], i * 0.01)[1]);
    }
    expect(low).toBeLessThan(0.15 * high);
    expect(f.sample([0, 0, 0], 1e3)[1]).toBe(0);
  });
});

describe('sampling contract', () => {
  const path = (i: number): Vec3 => [i * 0.006, 2 + 0.3 * Math.sin(i * 0.01), 0.002 * i];

  it('the same seed and the same sequence of calls give bit-identical wind', () => {
    const a = createWindField(hill.wind, 77, hill);
    const b = createWindField(hill.wind, 77, hill);
    for (let i = 0; i < 3000; i++) expect(a.sample(path(i), i * 0.001)).toEqual(b.sample(path(i), i * 0.001));
  });

  it('a different seed gives different turbulence but the same mean flow', () => {
    const a = createWindField(steady(hill.wind), 1, hill);
    const b = createWindField(steady(hill.wind), 2, hill);
    let differ = 0;
    for (let i = 0; i < 500; i++) {
      const wa = a.sample(path(i), i * 0.001);
      const wb = b.sample(path(i), i * 0.001);
      differ += Math.hypot(wa[0] - wb[0], wa[1] - wb[1], wa[2] - wb[2]);
      expect(a.mean(path(i), i * 0.001)).toEqual(b.mean(path(i), i * 0.001));
    }
    expect(differ / 500).toBeGreaterThan(0.05);
  });

  it('a repeated time does not advance the turbulence, and calls to mean() never disturb it', () => {
    const a = createWindField(hill.wind, 5, hill);
    const b = createWindField(hill.wind, 5, hill);
    for (let i = 0; i < 400; i++) {
      const wa: Vec3 = [...a.sample(path(i), i * 0.001)];
      // Same instant again, and some stateless queries in between.
      a.mean([50, 9, 3], i * 0.37);
      expect(a.sample(path(i), i * 0.001)).toEqual(wa);
      expect(b.sample(path(i), i * 0.001)).toEqual(wa);
    }
  });

  it('writes into the output array it is given', () => {
    const f = createWindField(hill.wind, 5, hill);
    const out: [number, number, number] = [9, 9, 9];
    expect(f.sample([1, 2, 3], 0, out)).toBe(out);
    expect(f.mean([1, 2, 3], 0, out)).toBe(out);
    expect(out.every((c) => Number.isFinite(c) && c !== 9)).toBe(true);
  });

  it('zero wind is exactly zero for every seed', () => {
    for (const seed of [1, 2, 3]) {
      const f = createWindField(steady(meadow.wind, { speed: 0 }), seed, meadow);
      for (let i = 0; i < 50; i++) expect(f.sample(path(i), i * 0.01)).toEqual([0, 0, 0]);
    }
  });
});

describe('gust events (doc 03 section 4)', () => {
  it('raise the whole mean flow by 1.5 sigma_u at 2 m when gustiness is 0.5, in 1-cosine ramps scheduled by the seed', () => {
    const spec: WindSpec = { ...meadow.wind, speed: 3, towardDeg: 0, thermals: [], gustiness: 0.5 };
    const calm = createWindField({ ...spec, gustiness: 0 }, 9, meadow);
    const gusty = createWindField(spec, 9, meadow);
    const base = calm.mean([0, 2, 0], 0)[0];
    const sigmaU = 2.4 * frictionVelocity(3, 0.03);
    let peak = 0;
    let events = 0;
    let inside = false;
    let prev = base;
    for (let t = 0; t <= 600; t += 0.05) {
      const u = gusty.mean([0, 2, 0], t)[0];
      expect(u).toBeGreaterThanOrEqual(base - 1e-12);
      // Smooth: the steepest part of a 1-cosine ramp over d_m / U = 7.7 m / 2.17 m/s.
      expect(Math.abs(u - prev)).toBeLessThan(0.05);
      prev = u;
      peak = Math.max(peak, u);
      const now = u > base + 1e-9;
      if (now && !inside) events++;
      inside = now;
    }
    within(peak - base, 1.5 * sigmaU, 1e-6);
    // Mean interval 30 - 90 s plus the event itself: between 4 and 15 events in ten minutes.
    expect(events).toBeGreaterThanOrEqual(4);
    expect(events).toBeLessThanOrEqual(15);
    // Twice the gustiness: twice the rise.
    const strong = createWindField({ ...spec, gustiness: 1 }, 9, meadow);
    let strongPeak = 0;
    for (let t = 0; t <= 600; t += 0.05) strongPeak = Math.max(strongPeak, strong.mean([0, 2, 0], t)[0]);
    within(strongPeak - base, 3 * sigmaU, 1e-6);
    // Another seed, another schedule.
    const other = createWindField(spec, 10, meadow);
    let differ = false;
    for (let t = 0; t <= 600 && !differ; t += 0.5) differ = Math.abs(other.mean([0, 2, 0], t)[0] - gusty.mean([0, 2, 0], t)[0]) > 1e-6;
    expect(differ).toBe(true);
  });

  it('are absent indoors and at gustiness 0', () => {
    const f = createWindField(steady(classroom.wind, { towardDeg: 0, turbulence: null }), 1, classroom);
    const g = createWindField(steady(meadow.wind), 1, meadow);
    for (let t = 0; t < 600; t += 1) {
      expect(f.mean([3, 1.5, 0], t)[0]).toBeCloseTo(0.05, 12);
      expect(g.mean([0, 10, 0], t)[0]).toBeCloseTo(1.5, 12);
    }
  });
});
