import { describe, expect, it } from 'vitest';
import type { Environment, Terrain } from '../types';
import { ENVIRONMENTS, getEnvironment, groundHeight, RELEASE_HEIGHT, terrainHeight, terrainMaxSlope, terrainTop } from './index';

describe('environments', () => {
  it('lists the six places with unique ids', () => {
    expect(ENVIRONMENTS.map((e) => e.id)).toEqual(['classroom', 'gym', 'hangar', 'meadow', 'hill', 'cliff']);
    for (const env of ENVIRONMENTS) {
      expect(env.name.length).toBeGreaterThan(0);
      expect(env.blurb.length).toBeGreaterThan(20);
      expect(env.blurb).not.toMatch(/\n/);
    }
  });

  it('getEnvironment finds by id and falls back to the classroom', () => {
    expect(getEnvironment('hangar').id).toBe('hangar');
    expect(getEnvironment('no-such-place').id).toBe('classroom');
  });

  it('rooms have the stated sizes with the thrower 1.5 m in from the back wall on the centreline', () => {
    const sizes: Record<string, [number, number, number]> = { classroom: [9, 7, 3], gym: [40, 25, 8], hangar: [120, 60, 25] };
    for (const [id, [length, width, height]] of Object.entries(sizes)) {
      const env = getEnvironment(id);
      const b = env.bounds!;
      expect(env.indoor).toBe(true);
      expect(env.adjustableWind).toBe(false);
      expect(b.xMax - b.xMin).toBeCloseTo(length, 12);
      expect(b.zMax - b.zMin).toBeCloseTo(width, 12);
      expect(b.ceiling).toBe(height);
      expect(env.launch[0] - b.xMin).toBeCloseTo(1.5, 12);
      expect(env.launch[2]).toBeCloseTo((b.zMin + b.zMax) / 2, 12);
      expect(env.wind.roughness).toBe(0);
      expect(env.wind.turbulence).not.toBeNull();
    }
  });

  it('open-air places have no walls, adjustable wind within the stated limits and similarity turbulence', () => {
    const limits: Record<string, number> = { meadow: 6, hill: 9, cliff: 9 };
    for (const [id, maxWind] of Object.entries(limits)) {
      const env = getEnvironment(id);
      expect(env.indoor).toBe(false);
      expect(env.bounds).toBeNull();
      expect(env.adjustableWind).toBe(true);
      expect(env.maxWind).toBe(maxWind);
      expect(env.wind.speed).toBeLessThanOrEqual(maxWind);
      expect(env.wind.roughness).toBeGreaterThan(0);
      expect(env.wind.turbulence).toBeNull();
    }
    expect(getEnvironment('meadow').wind.thermals).toHaveLength(1);
  });

  it('every release point is 1.8 m above the ground the thrower stands on, which is y = 0', () => {
    for (const env of ENVIRONMENTS) {
      expect(groundHeight(env, env.launch[0], env.launch[2])).toBeCloseTo(0, 12);
      expect(env.launch[1]).toBeCloseTo(RELEASE_HEIGHT, 12);
    }
  });
});

describe('terrain', () => {
  const hill: Terrain = { kind: 'hill', height: 15, halfWidth: 75, crestX: -20 };
  const cliff: Terrain = { kind: 'cliff', height: 25, edgeX: -8 };

  it('flat ground is y = 0 everywhere', () => {
    expect(terrainHeight({ kind: 'flat' }, 12, -3)).toBe(0);
    expect(terrainMaxSlope({ kind: 'flat' })).toBe(0);
    expect(terrainTop({ kind: 'flat' })).toBe(0);
  });

  it('hill: cosine ridges of the stated height and spacing, steepest slope 17 degrees', () => {
    const crest = terrainHeight(hill, -20);
    const valley = terrainHeight(hill, 55);
    expect(crest - valley).toBeCloseTo(15, 10);
    expect(terrainTop(hill)).toBeCloseTo(crest, 12);
    expect(terrainHeight(hill, 130)).toBeCloseTo(crest, 10);
    expect(terrainHeight(hill, 0)).toBeCloseTo(0, 12);
    // Uniform along z.
    expect(terrainHeight(hill, 10, 40)).toBe(terrainHeight(hill, 10, -40));
    const slope = terrainMaxSlope(hill);
    expect(slope).toBeCloseTo(0.314, 3);
    // The steepest point is half way down; no finite difference exceeds the stated maximum.
    let steepest = 0;
    for (let x = -100; x < 200; x += 0.5) steepest = Math.max(steepest, Math.abs(terrainHeight(hill, x + 0.5) - terrainHeight(hill, x)) / 0.5);
    expect(steepest).toBeLessThanOrEqual(slope + 1e-9);
    expect(steepest).toBeGreaterThan(0.99 * slope);
  });

  it('cliff: level top, a quarter-circle face and the sea 25 m below the top', () => {
    const top = terrainTop(cliff);
    expect(top).toBeGreaterThan(0);
    expect(terrainHeight(cliff, -30)).toBeCloseTo(top, 12);
    expect(terrainHeight(cliff, -8)).toBeCloseTo(top, 12);
    expect(terrainHeight(cliff, 0)).toBeCloseTo(0, 12);
    expect(terrainHeight(cliff, 17)).toBeCloseTo(top - 25, 12);
    expect(terrainHeight(cliff, 500)).toBeCloseTo(top - 25, 12);
    // On the face every point is 25 m from the centre of the circle (under the edge, at sea level).
    for (const x of [-5, 0, 6, 12, 16.9]) {
      const y = terrainHeight(cliff, x);
      expect(Math.hypot(x + 8, y - (top - 25))).toBeCloseTo(25, 9);
    }
    // Monotonic down toward the sea.
    let prev = Infinity;
    for (let x = -20; x < 40; x += 0.25) {
      const y = terrainHeight(cliff, x);
      expect(y).toBeLessThanOrEqual(prev);
      prev = y;
    }
    expect(terrainMaxSlope(cliff)).toBe(Infinity);
  });

  it('a cliff with the thrower behind the edge has its top at y = 0', () => {
    const back: Terrain = { kind: 'cliff', height: 25, edgeX: 2 };
    expect(terrainTop(back)).toBe(0);
    expect(terrainHeight(back, 0)).toBe(0);
    expect(terrainHeight(back, 2)).toBe(0);
    expect(terrainHeight(back, 27)).toBeCloseTo(-25, 12);
  });

  it('groundHeight reads the terrain of the environment', () => {
    const env: Environment = { ...getEnvironment('hill'), terrain: hill };
    expect(groundHeight(env, 30, 0)).toBe(terrainHeight(hill, 30, 0));
  });
});
