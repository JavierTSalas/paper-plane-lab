import { describe, expect, it } from 'vitest';
import { getEnvironment } from '../../core/env';
import type { Arena, FlightResult, FlightSample, Vec3 } from '../../core/types';
import { armStrength, beaufort, clampLaunch, conditionsFor, nextSeed, pushGhost, STILL_AIR_SEED, swipeToThrow, trailOf, windDirectionLabel } from './flight';
import { matchingArenas } from './ranking';
import { createLiveSample, PlaybackClock, sampleInto } from './stage/playback';

function fakeFlight(n: number, hz = 120): FlightResult {
  const samples: FlightSample[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / hz;
    samples.push({ t, pos: [t * 5, 1.8 - t, 0], quat: [0, 0, 0, 1], vel: [5, -1, 0], omega: [0, 0, 0], airspeed: 5, alpha: 0.1, beta: 0, cl: 0.5, cd: 0.1, wind: [0, 0, 0] });
  }
  return { seed: 1, dt: 0.001, sampleHz: hz, samples, events: [], metrics: {} as FlightResult['metrics'], diagnosis: [], outcome: 'ground' };
}

describe('labels', () => {
  it('names the arm strength', () => {
    expect(armStrength(3)).toBe('gentle');
    expect(armStrength(8)).toBe('firm');
    expect(armStrength(15)).toBe('hard');
    expect(armStrength(27)).toBe('athlete');
  });

  it('uses the Beaufort scale', () => {
    expect(beaufort(0.2)).toEqual({ force: 0, name: 'Calm' });
    expect(beaufort(1.5).force).toBe(2);
    expect(beaufort(3.5).force).toBe(3);
    expect(beaufort(9).force).toBe(5);
  });

  it('describes the wind relative to the throw', () => {
    expect(windDirectionLabel(0)).toBe('Tailwind');
    expect(windDirectionLabel(180)).toBe('Headwind');
    // Blowing toward +z (the thrower's right) means it comes from the left.
    expect(windDirectionLabel(90)).toBe('Crosswind from the left');
    expect(windDirectionLabel(270)).toBe('Crosswind from the right');
    expect(windDirectionLabel(-150)).toBe('Quartering headwind from the right');
  });
});

describe('seeds and conditions', () => {
  it('repeats indoors and varies outdoors', () => {
    expect(nextSeed(getEnvironment('classroom'), 0.3)).toBe(STILL_AIR_SEED);
    const meadow = getEnvironment('meadow');
    expect(nextSeed(meadow, 0.3)).not.toBe(nextSeed(meadow, 0.7));
  });

  it('only carries wind settings where they can change', () => {
    const w = { speed: 3, towardDeg: 180, gustiness: 0.2 };
    expect(conditionsFor(getEnvironment('hangar'), w)).toEqual({ envId: 'hangar' });
    expect(conditionsFor(getEnvironment('meadow'), w)).toEqual({ envId: 'meadow', windSpeed: 3, windTowardDeg: 180, gustiness: 0.2 });
  });
});

describe('swipe to throw', () => {
  it('ignores taps and downward strokes', () => {
    expect(swipeToThrow(5, -10, 0, -800, 800)).toBeNull();
    expect(swipeToThrow(0, 200, 0, 1200, 800)).toBeNull();
  });

  it('throws faster for a faster swipe and lower for a leaning swipe', () => {
    const slow = swipeToThrow(0, -200, 0, -600, 800);
    const fast = swipeToThrow(0, -200, 0, -3000, 800);
    const lean = swipeToThrow(200, -200, 1500, -1500, 800);
    expect(slow && fast && lean).toBeTruthy();
    expect(fast!.speed).toBeGreaterThan(slow!.speed);
    expect(lean!.pitchDeg).toBeLessThan(fast!.pitchDeg);
    expect(fast!.pitchDeg).toBeGreaterThan(10);
  });

  it('stays inside the throw limits', () => {
    const r = swipeToThrow(0, -400, 0, -1e6, 800)!;
    expect(r.speed).toBeLessThanOrEqual(30);
    expect(clampLaunch({ speed: 99, pitchDeg: 120, yawDeg: 90, rollDeg: -40, aoaDeg: 0 })).toEqual({ speed: 30, pitchDeg: 90, yawDeg: 30, rollDeg: -20, aoaDeg: 0 });
  });
});

describe('trails and playback', () => {
  it('thins a flight to a trail that keeps the last point', () => {
    const f = fakeFlight(121);
    const trail = trailOf(f, 20);
    expect(trail[0]).toBe(f.samples[0].pos);
    expect(trail[trail.length - 1]).toBe(f.samples[120].pos);
    expect(trail.length).toBe(21);
  });

  it('keeps three ghosts, newest first', () => {
    let g: Vec3[][] = [];
    for (let i = 0; i < 5; i++) g = pushGhost(g, [[i, 0, 0]]);
    expect(g.map((t) => t[0][0])).toEqual([4, 3, 2]);
  });

  it('interpolates into a reused sample and clamps to the flight', () => {
    const f = fakeFlight(121);
    const s = createLiveSample();
    sampleInto(f, 0.5, s);
    expect(s.pos[0]).toBeCloseTo(2.5, 6);
    expect(s.pos[1]).toBeCloseTo(1.3, 6);
    sampleInto(f, 99, s);
    expect(s.t).toBeCloseTo(1, 6);
    expect(s.pos[0]).toBeCloseTo(5, 6);
  });

  it('plays, ends once and replays from the start', () => {
    const c = new PlaybackClock();
    c.reset(1);
    c.play();
    expect(c.tick(0.6)).toBe(false);
    expect(c.tick(0.6)).toBe(true);
    expect(c.playing).toBe(false);
    expect(c.t).toBe(1);
    c.play();
    expect(c.t).toBe(0);
    c.rate = 0.25;
    c.tick(1);
    expect(c.t).toBeCloseTo(0.25);
  });
});

describe('ranking adapter', () => {
  const arena: Arena = { id: 'a', name: 'A', envId: 'hangar', conditions: { envId: 'hangar' }, maxThrowSpeed: 10, blurb: '' };
  const launch = { speed: 9, pitchDeg: 5, yawDeg: 0, rollDeg: 0, aoaDeg: 0 };
  it('matches place, wind settings and the speed cap', () => {
    expect(matchingArenas({ envId: 'hangar' }, launch, [arena])).toHaveLength(1);
    expect(matchingArenas({ envId: 'gym' }, launch, [arena])).toHaveLength(0);
    expect(matchingArenas({ envId: 'hangar' }, { ...launch, speed: 12 }, [arena])).toHaveLength(0);
    expect(matchingArenas({ envId: 'hangar', windSpeed: 1 }, launch, [arena])).toHaveLength(0);
  });
});
