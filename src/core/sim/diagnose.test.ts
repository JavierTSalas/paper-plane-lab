/**
 * The Professor's reading of a flight: every diagnosis code is reachable from a constructed throw or trim,
 * and the texts are well formed.
 */
import { describe, expect, it } from 'vitest';
import { getEnvironment } from '../env';
import { analyzeTrim } from '../tunnel';
import { airFrom } from '../wind';
import type { Diagnosis, DiagnosisCode, FlightResult } from '../types';
import { releasedAt, simDart, simGlider, stillAir, throwOf } from './simFixtures';
import { defaultLaunch, diagnose, simulateFlight, THROW_LIMITS } from './index';

const gym = getEnvironment('gym');
const hangar = getEnvironment('hangar');
const classroom = getEnvironment('classroom');
const hill = getEnvironment('hill');
const cliff = getEnvironment('cliff');
const dart = simDart();
const glider = simGlider();

const codes = (r: FlightResult): DiagnosisCode[] => r.diagnosis.map((d) => d.code);

/** One short, plain sentence: starts with a capital, ends with a full stop, no leftovers of failed formatting. */
function expectSentence(text: string): void {
  expect(text.length).toBeGreaterThan(15);
  expect(text.length).toBeLessThan(230);
  expect(text).toMatch(/^[A-Z]/);
  expect(text).toMatch(/\.$/);
  expect(text).not.toMatch(/NaN|undefined|null|Infinity|\s{2}|-0\b/);
}

function expectWellFormed(list: Diagnosis[]): void {
  expect(list.length).toBeGreaterThan(0);
  expect(list.length).toBeLessThanOrEqual(3);
  expect(new Set(list.map((d) => d.code)).size).toBe(list.length);
  for (const d of list) {
    expectSentence(d.what);
    expectSentence(d.why);
    if (d.code === 'clean-glide') expect(d.fix).toBe('');
    else expectSentence(d.fix);
  }
}

describe('diagnosis: each reading is reachable', () => {
  const seen = new Set<DiagnosisCode>();
  const check = (r: FlightResult, first: DiagnosisCode | DiagnosisCode[], also: DiagnosisCode[] = []): Diagnosis => {
    expectWellFormed(r.diagnosis);
    const allowed = Array.isArray(first) ? first : [first];
    expect(allowed).toContain(r.diagnosis[0].code);
    for (const code of also) expect(codes(r)).toContain(code);
    for (const c of codes(r)) seen.add(c);
    return r.diagnosis[0];
  };

  it('clean-glide: a matched throw gets exactly one remark and no fix', () => {
    const r = simulateFlight(dart, throwOf(8, 5), gym, { envId: 'gym' }, 1);
    const d = check(r, 'clean-glide');
    expect(codes(r)).toEqual(['clean-glide']);
    expect(d.what).toContain(`${r.metrics.distance.toFixed(1)} m`);
    expect(d.why).toMatch(/ahead of the neutral point/);
    // A long, settled glide names its speed.
    const long = simulateFlight(glider, throwOf(3, -10, { aoaDeg: 6 }), releasedAt(stillAir(hangar), 15), { envId: 'hangar' }, 1);
    expect(codes(long)).toEqual(['clean-glide']);
    expect(long.diagnosis[0].what).toMatch(/settled at 3\.0 m\/s/);
  });

  it('nose-dive: no up-bend on a nose-heavy dart', () => {
    const flat = simDart({ elevatorDeg: 0 });
    expect(analyzeTrim(flat, airFrom(gym.tempC, gym.pressurePa, gym.humidity)).trimmable).toBe(false);
    const r = simulateFlight(flat, throwOf(7, 0), gym, { envId: 'gym' }, 1);
    const d = check(r, 'nose-dive');
    expect(r.metrics.airtime).toBeLessThan(1);
    expect(d.why).toMatch(/ahead of the neutral point/);
    expect(d.fix).toMatch(/Bend both trailing edges up about 2 mm/);
  });

  it('stall-mush: thrown steeply upward, or trimmed far too nose-up', () => {
    const steep = simulateFlight(glider, throwOf(4, 40), gym, { envId: 'gym' }, 1);
    const d = check(steep, 'stall-mush');
    expect(steep.metrics.stallCount).toBeGreaterThanOrEqual(1);
    expect(d.why).toMatch(/40° upward/);
    expect(d.fix).toMatch(/Throw flatter/);
    const overTrimmed = simulateFlight(simDart({ elevatorDeg: 12 }), throwOf(6, 10), gym, { envId: 'gym' }, 1);
    expect(codes(overTrimmed)).toContain('stall-mush');
    expectWellFormed(overTrimmed.diagnosis);
    expect(overTrimmed.diagnosis.find((x) => x.code === 'stall-mush')!.fix).toMatch(/Flatten the up-bend/);
  });

  it('porpoise: a glider thrown at more than twice its glide speed', () => {
    const r = simulateFlight(glider, throwOf(7, 10), releasedAt(hangar, 6), { envId: 'hangar' }, 1);
    const d = check(r, 'porpoise');
    expect(r.metrics.stallCount).toBeGreaterThanOrEqual(2);
    expect(d.why).toMatch(/glides at 3\.0 m\/s but left your hand at 7\.0 m\/s/);
    expect(d.fix).toMatch(/Throw gentler and flatter/);
  });

  it('loop: a dart thrown at nearly three times its glide speed', () => {
    const r = simulateFlight(dart, throwOf(14, 20), stillAir(hangar), { envId: 'hangar' }, 1);
    const d = check(r, 'loop');
    expect(d.why).toMatch(/square of speed/);
    expect(d.fix).toMatch(/Throw gentler/);
  });

  it('spiral: aileron trim on the glider, given height to wind up', () => {
    const r = simulateFlight(simGlider({ aileronDeg: 2 }), throwOf(4, 0), releasedAt(stillAir(hangar), 10), { envId: 'hangar' }, 1);
    const d = check(r, 'spiral');
    expect(d.why).toMatch(/not bent alike/);
    expect(d.fix).toMatch(/Even out the bends/);
  });

  it('roll-off: aileron trim on the dart, or a banked release', () => {
    const trimmed = simulateFlight(simDart({ aileronDeg: 1.5 }), throwOf(7, 5), stillAir(gym), { envId: 'gym' }, 1);
    check(trimmed, ['roll-off', 'spiral']);
    const banked = simulateFlight(glider, throwOf(4, 0, { rollDeg: 45 }), stillAir(gym), { envId: 'gym' }, 1);
    const d = check(banked, 'roll-off');
    expect(d.what).toMatch(/rolled to the right/);
    expect(d.why).toMatch(/banked 45° to the right/);
    expect(banked.metrics.lateral).toBeGreaterThan(2);
  });

  it('tumble: centre of gravity behind the neutral point', () => {
    const tailHeavy = simGlider({ clip: { mass: 0.004, x: 0 } });
    const r = simulateFlight(tailHeavy, throwOf(5, 10), releasedAt(stillAir(hangar), 10), { envId: 'hangar' }, 1);
    const d = check(r, 'tumble');
    expect(d.why).toMatch(/behind the neutral point/);
    expect(d.fix).toMatch(/weight at the nose/);
  });

  it('hit-wall: the classroom is shorter than a decent throw', () => {
    const r = simulateFlight(dart, throwOf(6, 5), classroom, { envId: 'classroom' }, 1);
    const d = check(r, 'hit-wall');
    expect(d.what).toMatch(/far wall/);
    expect(d.why).toMatch(/9 m long/);
  });

  it('hit-ceiling: a steep throw in a low room', () => {
    const r = simulateFlight(dart, throwOf(9, 40), classroom, { envId: 'classroom' }, 1);
    const d = check(r, 'hit-ceiling');
    expect(d.what).toMatch(/3\.0 m up/);
    expect(d.fix).toMatch(/Throw flatter/);
  });

  it('too-slow: thrown at half its glide speed', () => {
    const r = simulateFlight(dart, throwOf(2.5, 0), gym, { envId: 'gym' }, 1);
    const d = check(r, 'too-slow');
    expect(d.why).toMatch(/needs about 5\.\d m\/s/);
    expect(d.fix).toMatch(/Throw it firmly and level/);
  });

  it('ballistic: an untrimmed dart thrown hard', () => {
    const r = simulateFlight(simDart({ elevatorDeg: 0 }), throwOf(12, 10), stillAir(hangar), { envId: 'hangar' }, 1);
    check(r, 'ballistic');
  });

  it('wind-carried: any flight on the hill or off the cliff', () => {
    const onHill = simulateFlight(dart, throwOf(6, 0), hill, { envId: 'hill' }, 2);
    expect(codes(onHill)).toContain('wind-carried');
    expectWellFormed(onHill.diagnosis);
    for (const c of codes(onHill)) seen.add(c);
    const lifted = simulateFlight(glider, throwOf(3, 0), cliff, { envId: 'cliff', windSpeed: 1, gustiness: 0 }, 1);
    const d = lifted.diagnosis.find((x) => x.code === 'wind-carried')!;
    expect(d.what).toMatch(/Rising air held it up/);
    expectWellFormed(lifted.diagnosis);
  });

  it('together the constructed flights reach every code', () => {
    const all: DiagnosisCode[] = [
      'clean-glide', 'nose-dive', 'stall-mush', 'porpoise', 'loop', 'spiral', 'roll-off', 'tumble', 'wind-carried',
      'hit-wall', 'hit-ceiling', 'too-slow', 'ballistic',
    ];
    for (const code of all) expect([...seen]).toContain(code);
  });
});

describe('diagnosis: structure', () => {
  it('simulateFlight fills result.diagnosis with what diagnose() returns', () => {
    const launch = throwOf(8, 5);
    const r = simulateFlight(dart, launch, gym, { envId: 'gym' }, 3);
    expect(diagnose(r, dart, launch, gym)).toEqual(r.diagnosis);
  });

  it('is well formed over a wide sweep of throws, trims and places, and clean-glide always stands alone', () => {
    let count = 0;
    for (const env of [classroom, gym, hill]) {
      for (const af of [dart, glider, simDart({ elevatorDeg: 0 }), simGlider({ elevatorDeg: 6, aileronDeg: 1 })]) {
        for (const speed of [2, 5, 9, 16]) {
          for (const pitch of [-15, 5, 45, 85]) {
            const r = simulateFlight(af, throwOf(speed, pitch, { rollDeg: speed === 9 ? 15 : 0 }), env, { envId: env.id }, 1);
            expectWellFormed(r.diagnosis);
            if (codes(r).includes('clean-glide')) expect(r.diagnosis).toHaveLength(1);
            if (r.outcome === 'wall') expect(codes(r)).toContain('hit-wall');
            if (r.outcome === 'ceiling') expect(codes(r)).toContain('hit-ceiling');
            if (env.indoor) expect(codes(r)).not.toContain('wind-carried');
            count++;
          }
        }
      }
    }
    expect(count).toBe(192);
  });
});

describe('throw limits and defaults (doc 02 section 5)', () => {
  it('span the recommended control ranges', () => {
    expect(THROW_LIMITS.minSpeed).toBe(2);
    expect(THROW_LIMITS.maxSpeed).toBe(30);
    expect(THROW_LIMITS.casualMinSpeed).toBe(5);
    expect(THROW_LIMITS.casualMaxSpeed).toBe(11);
    expect(THROW_LIMITS.eliteSpeed).toBe(27);
    expect(THROW_LIMITS.releaseHeight).toBe(1.8);
    expect(THROW_LIMITS.minPitchDeg).toBe(-20);
    expect(THROW_LIMITS.maxPitchDeg).toBe(90);
    expect(THROW_LIMITS.typicalSpeed).toBeGreaterThanOrEqual(THROW_LIMITS.casualMinSpeed);
    expect(THROW_LIMITS.typicalSpeed).toBeLessThanOrEqual(THROW_LIMITS.casualMaxSpeed);
  });

  it('defaultLaunch gives a casual, straight throw for every category', () => {
    for (const category of [undefined, 'dart', 'glider', 'hybrid', 'wing', 'custom'] as const) {
      const l = defaultLaunch(category);
      expect(l.speed).toBeGreaterThanOrEqual(THROW_LIMITS.casualMinSpeed);
      expect(l.speed).toBeLessThanOrEqual(THROW_LIMITS.casualMaxSpeed);
      expect(l.pitchDeg).toBeGreaterThanOrEqual(0);
      expect(l.pitchDeg).toBeLessThanOrEqual(10);
      expect(l.yawDeg).toBe(0);
      expect(l.rollDeg).toBe(0);
    }
    expect(defaultLaunch('dart').speed).toBeGreaterThan(defaultLaunch('glider').speed);
    // The defaults fly: the fixture dart and glider cross a good part of the gym.
    expect(simulateFlight(dart, defaultLaunch('dart'), gym, { envId: 'gym' }, 1).metrics.distance).toBeGreaterThan(6);
    expect(simulateFlight(glider, defaultLaunch('glider'), gym, { envId: 'gym' }, 1).metrics.distance).toBeGreaterThan(6);
  });
});
