/**
 * Integrator and flight checks: the validation table of docs/research/02-flight-dynamics-validation.md
 * (V1, V2, V3, V5, V7, V8, V9, V10, V12), energy, determinism, contact, events and speed.
 */
import { describe, expect, it } from 'vitest';
import { aeroLoads, createAeroLoads } from '../aero';
import { STANDARD_GRAVITY } from '../airframe';
import { getEnvironment } from '../env';
import { DEG, mat3Inverse, mat3MulVec, quatRotate, quatRotateInv } from '../math';
import { analyzeTrim } from '../tunnel';
import { airFrom, createWindField, resolveWind } from '../wind';
import type { Airframe, Environment, FlightResult, FlightSample, Launch, Mat3, Vec3, WindField } from '../types';
import { releasedAt, simDart, simGlider, stillAir, throwOf } from './simFixtures';
import { launchAttitude, launchVelocity, sampleAt, simulateFlight } from './index';

const g = STANDARD_GRAVITY;
const gym = getEnvironment('gym');
const hangar = getEnvironment('hangar');
const classroom = getEnvironment('classroom');
const meadow = getEnvironment('meadow');
const hill = getEnvironment('hill');
const cliff = getEnvironment('cliff');

const dart = simDart();
const glider = simGlider();
const airOf = (env: Environment) => airFrom(env.tempC, env.pressurePa, env.humidity);

/** Open, flat, windless ground with the release point high up: room for long flights. */
const tower = (height: number): Environment => releasedAt(stillAir(meadow), height);

const within = (value: number, expected: number, fraction: number): void => {
  expect(Math.abs(value - expected)).toBeLessThanOrEqual(fraction * Math.abs(expected));
};

/** A launch that starts the plane in its trimmed glide. */
function trimmedLaunch(af: Airframe, env: Environment, speedFactor = 1, more: Partial<Launch> = {}): Launch {
  const trim = analyzeTrim(af, airOf(env));
  if (!trim.trimmable || trim.speed === null || trim.glideRatio === null || trim.alphaDeg === null) throw new Error('fixture does not trim');
  return throwOf(trim.speed * speedFactor, -Math.atan(1 / trim.glideRatio) / DEG, { aoaDeg: trim.alphaDeg, ...more });
}

const addM = (a: Mat3, b: Mat3): Mat3 => a.map((v, i) => v + b[i]) as unknown as Mat3;
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Mechanical energy of plane plus entrained air: kinetic (with apparent mass and inertia) + potential. */
function energy(af: Airframe, s: FlightSample): number {
  const v = quatRotateInv(s.quat, s.vel);
  const M = addM([af.mass, 0, 0, 0, af.mass, 0, 0, 0, af.mass], af.apparentMass);
  const J = addM(af.inertia, af.apparentInertia);
  return 0.5 * dot(v, mat3MulVec(M, v)) + 0.5 * dot(s.omega, mat3MulVec(J, s.omega)) + af.mass * g * s.pos[1];
}

describe('launch', () => {
  it('points the nose along the throw, then rolls about it, then adds the angle of attack', () => {
    const launch: Launch = { speed: 7, pitchDeg: 20, yawDeg: 30, rollDeg: 25, aoaDeg: 4 };
    const q = launchAttitude(launch);
    const v = launchVelocity(launch);
    expect(Math.hypot(...v)).toBeCloseTo(7, 12);
    expect(v[1]).toBeCloseTo(7 * Math.sin(20 * DEG), 12);
    // Heading from +x toward +z.
    expect(Math.atan2(v[2], v[0]) / DEG).toBeCloseTo(30, 10);
    // In the body frame the air comes from ahead and 4 degrees below the nose, with no sideslip, whatever the roll.
    const body = quatRotateInv(q, v);
    expect(body[2]).toBeCloseTo(0, 12);
    expect(Math.atan2(-body[1], body[0]) / DEG).toBeCloseTo(4, 10);
    // Positive roll puts the right wing (+z body) down.
    expect(quatRotate(q, [0, 0, 1])[1]).toBeLessThan(0);
    const level = launchAttitude({ speed: 7, pitchDeg: 0, yawDeg: 0, rollDeg: 0, aoaDeg: 10 });
    expect(quatRotate(level, [1, 0, 0])[1]).toBeCloseTo(Math.sin(10 * DEG), 12);
  });

  it('starts at the environment\'s release point with zero rotation', () => {
    const r = simulateFlight(dart, throwOf(8, 5), gym, { envId: 'gym' }, 1);
    expect(r.samples[0].t).toBe(0);
    expect(r.samples[0].pos).toEqual([...gym.launch]);
    expect(r.samples[0].omega).toEqual([0, 0, 0]);
    expect(r.samples[0].airspeed).toBeGreaterThan(7.8);
    expect(r.events[0]).toEqual({ t: 0, kind: 'launch', pos: [...gym.launch] });
  });
});

describe('V1 ballistic flight (air switched off)', () => {
  const env = tower(2);
  const launch = throwOf(10, 45);
  const r = simulateFlight(dart, launch, env, { envId: 'meadow' }, 1, { aero: false });
  const v0 = launchVelocity(launch);

  it('follows the exact parabola within 1 mm at every sample', () => {
    expect(r.samples.length).toBeGreaterThan(150);
    for (const s of r.samples) {
      expect(Math.abs(s.pos[0] - v0[0] * s.t)).toBeLessThan(1e-3);
      expect(Math.abs(s.pos[1] - (2 + v0[1] * s.t - 0.5 * g * s.t * s.t))).toBeLessThan(1e-3);
      expect(Math.abs(s.pos[2])).toBeLessThan(1e-3);
      expect(s.vel[1]).toBeCloseTo(v0[1] - g * s.t, 9);
      // No air: the attitude never changes.
      for (let i = 0; i < 4; i++) expect(s.quat[i]).toBeCloseTo(r.samples[0].quat[i], 12);
    }
  });

  it('is back at release height after 10.197 m', () => {
    const back = sampleAt(r, (2 * v0[1]) / g);
    expect(Math.abs(back.pos[0] - 10.197)).toBeLessThan(1e-3);
    expect(Math.abs(back.pos[1] - 2)).toBeLessThan(1e-3);
  });

  it('ends when its lowest point touches the ground, at the time the parabola says', () => {
    expect(r.outcome).toBe('ground');
    const end = r.samples[r.samples.length - 1];
    let lowest = Infinity;
    for (const p of dart.contactPoints) {
      const world = quatRotate(end.quat, [p[0] - dart.cg[0], p[1] - dart.cg[1], p[2] - dart.cg[2]]);
      lowest = Math.min(lowest, world[1]);
    }
    expect(Math.abs(end.pos[1] + lowest)).toBeLessThan(1e-3);
    const tTouch = (v0[1] + Math.sqrt(v0[1] * v0[1] + 2 * g * (2 + lowest))) / g;
    expect(Math.abs(r.metrics.airtime - tTouch)).toBeLessThan(1e-5);
    const touch = r.events[r.events.length - 1];
    expect(touch.kind).toBe('ground');
    expect(Math.abs(touch.pos[1])).toBeLessThan(1e-3);
    // Distance is measured to the touch point, not to the centre of gravity.
    expect(r.metrics.distance).toBeCloseTo(Math.hypot(touch.pos[0], touch.pos[2]), 9);
  });
});

describe('V2 torque-free spinning body, 10 s', () => {
  const kinetic = (s: FlightSample): number => 0.5 * dot(s.omega, mat3MulVec(dart.inertia, s.omega));
  const momentum = (s: FlightSample): Vec3 => quatRotate(s.quat, mat3MulVec(dart.inertia, s.omega));
  /** Largest relative drift of rotational energy and of the angular-momentum vector over a flight. */
  const drift = (r: FlightResult): { energy: number; momentum: number; wander: number } => {
    const k0 = kinetic(r.samples[0]);
    const l0 = momentum(r.samples[0]);
    const size = Math.hypot(...l0);
    const out = { energy: 0, momentum: 0, wander: 0 };
    for (const s of r.samples) {
      out.energy = Math.max(out.energy, Math.abs(kinetic(s) - k0) / k0);
      const l = momentum(s);
      out.momentum = Math.max(out.momentum, Math.hypot(l[0] - l0[0], l[1] - l0[1], l[2] - l0[2]) / size);
      out.wander = Math.max(out.wander, Math.abs(s.omega[0] - r.samples[0].omega[0]));
      expect(Math.abs(Math.hypot(...s.quat) - 1)).toBeLessThan(1e-12);
    }
    return out;
  };
  // 100 Hz output: every sample falls on a step boundary for both step sizes, so no interpolation is involved.
  const spin = (omega0: Vec3, dt?: number): FlightResult =>
    simulateFlight(dart, throwOf(5, 30), tower(700), { envId: 'meadow' }, 1, { aero: false, omega0, maxTime: 10, dt, sampleHz: 100 });

  it('conserves rotational energy and angular momentum to 1e-6', () => {
    const r = spin([2, 3, -1.5]);
    expect(r.outcome).toBe('timeout');
    expect(r.metrics.airtime).toBeCloseTo(10, 9);
    const d = drift(r);
    expect(d.energy).toBeLessThan(1e-6);
    expect(d.momentum).toBeLessThan(1e-6);
    // The body really tumbles: its inertia tensor is far from spherical, so the body rates wander.
    expect(d.wander).toBeGreaterThan(1);
  });

  it('the remaining drift is fourth order in the step: halving the step divides it by 16', () => {
    // A violent spin (the roll rate passes 60 rad/s) makes the truncation error visible above round-off.
    const coarse = drift(spin([4, 6, -3]));
    const fine = drift(spin([4, 6, -3], 0.5e-3));
    expect(coarse.momentum).toBeLessThan(1e-5);
    expect(coarse.momentum / fine.momentum).toBeGreaterThan(12);
    expect(coarse.momentum / fine.momentum).toBeLessThan(20);
    expect(coarse.energy / fine.energy).toBeGreaterThan(12);
    expect(coarse.energy / fine.energy).toBeLessThan(40);
  });
});

describe('energy in still air', () => {
  const cases: [string, Airframe, Launch, Environment, Vec3?][] = [
    ['dart, casual throw', dart, throwOf(8, 5), stillAir(gym)],
    ['dart, hard and steep', dart, throwOf(14, 35), stillAir(hangar)],
    ['dart, banked and yawed', dart, throwOf(7, 5, { rollDeg: 40, yawDeg: 15 }), stillAir(gym)],
    ['glider, gentle', glider, throwOf(4, 0), stillAir(gym)],
    ['glider, thrown far too fast (loops)', glider, throwOf(12, 10), stillAir(hangar)],
    ['glider, thrown straight up (stalls)', glider, throwOf(6, 80), stillAir(hangar)],
    ['glider, long glide', glider, trimmedLaunch(glider, tower(15)), tower(15)],
    ['dart, released spinning', dart, throwOf(6, 10), stillAir(gym), [8, 3, 12]],
  ];
  for (const [name, af, launch, env, omega0] of cases) {
    it(`never increases: ${name}`, () => {
      const r = simulateFlight(af, launch, env, { envId: env.id }, 1, { omega0 });
      const e0 = energy(af, r.samples[0]);
      let prev = e0;
      for (const s of r.samples) {
        const e = energy(af, s);
        expect(e).toBeLessThanOrEqual(prev + 1e-7 * e0);
        prev = e;
      }
      // And it is really dissipated: drag takes a visible share by the end.
      expect(prev).toBeLessThan(0.98 * e0);
    });
  }
});

describe('V3 trimmed glide in still air agrees with the virtual tunnel', () => {
  const env = tower(20);

  it('fixture dart: speed, glide ratio, sink and angle of attack within 5 % of analyzeTrim', () => {
    const trim = analyzeTrim(dart, airOf(env));
    const r = simulateFlight(dart, trimmedLaunch(dart, env), env, { envId: env.id }, 1);
    const m = r.metrics;
    expect(r.outcome).toBe('ground');
    expect(m.glideRatio).not.toBeNull();
    within(m.glideSpeed!, trim.speed!, 0.05);
    within(m.glideRatio!, trim.glideRatio!, 0.05);
    within(m.sinkRate!, trim.sinkRate!, 0.05);
    within(m.glideAlpha! / DEG, trim.alphaDeg!, 0.05);
    within(Math.atan(1 / m.glideRatio!), Math.atan(1 / trim.glideRatio!), 0.05);
    // The whole flight is one steady glide: distance = height x glide ratio.
    within(m.distance, 20 * trim.glideRatio!, 0.05);
    within(m.airtime, 20 / trim.sinkRate!, 0.05);
    expect(m.stallCount).toBe(0);
    expect(Math.abs(m.lateral)).toBeLessThan(0.05 * m.distance);
    // Evidence band (doc 02 section 6.1, Ng et al.): V = 4.9 m/s +-15 %.
    within(m.glideSpeed!, 4.9, 0.15);
    // The same source gives L/D about 5 (band 4 - 6), sink 1.0 m/s and 11 degrees. This element model has no
    // leading-edge suction and pays trim drag, and its darts glide at 3.3 - 4: BELOW the band. Stated here so
    // that the gap is visible, and so that this test fails when the aerodynamics change.
    expect(m.glideRatio!).toBeGreaterThan(3.3);
    expect(m.glideRatio!).toBeLessThan(6);
    expect(m.sinkRate!).toBeGreaterThan(0.8);
    expect(m.sinkRate!).toBeLessThan(1.5);
  });

  it('fixture glider: the same agreement, inside the glider band (L/D 5 - 8)', () => {
    const trim = analyzeTrim(glider, airOf(env));
    const r = simulateFlight(glider, trimmedLaunch(glider, env), env, { envId: env.id }, 1);
    const m = r.metrics;
    within(m.glideSpeed!, trim.speed!, 0.05);
    within(m.glideRatio!, trim.glideRatio!, 0.05);
    within(m.sinkRate!, trim.sinkRate!, 0.05);
    within(m.glideAlpha! / DEG, trim.alphaDeg!, 0.05);
    expect(m.glideRatio!).toBeGreaterThan(5);
    expect(m.glideRatio!).toBeLessThan(8);
    // Instantaneous L/D from the samples equals the glide ratio (doc 02 section 8: within 2 %).
    const mid = r.samples[Math.floor(r.samples.length / 2)];
    within(mid.cl / mid.cd, m.glideRatio!, 0.02);
  });
});

describe('V5 phugoid after a launch at 1.5 times the glide speed', () => {
  /** Period (mean of the first two) and damping ratio of the speed oscillation about the glide speed. */
  function phugoid(af: Airframe, env: Environment): { period: number; zeta: number } {
    const trim = analyzeTrim(af, airOf(env));
    const r = simulateFlight(af, trimmedLaunch(af, env, 1.5), env, { envId: env.id }, 1);
    // Upward crossings of the glide speed and the peaks between them.
    const crossings: number[] = [];
    const peaks: number[] = [];
    let peak = 0;
    for (let i = 1; i < r.samples.length; i++) {
      const a = r.samples[i - 1].airspeed - trim.speed!;
      const b = r.samples[i].airspeed - trim.speed!;
      peak = Math.max(peak, b);
      if (a < 0 && b >= 0) {
        crossings.push(r.samples[i - 1].t + ((r.samples[i].t - r.samples[i - 1].t) * -a) / (b - a));
        peak = 0;
      } else if (a >= 0 && b < 0 && crossings.length > 0) {
        peaks.push(peak);
      }
    }
    expect(crossings.length).toBeGreaterThanOrEqual(3);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    const decrement = Math.log(peaks[0] / peaks[1]);
    return { period: (crossings[2] - crossings[0]) / 2, zeta: decrement / Math.hypot(2 * Math.PI, decrement) };
  }

  /**
   * Lanchester's period pi sqrt(2) V / g assumes the plane holds its angle of attack while the path curves.
   * A paper plane is so light for its size that this fails. Curving the path at rate q needs the pitching
   * moment -M_q q, which the plane gets by flying at an angle of attack lower by (M_q / M_alpha) q; that costs
   * the lift L_alpha (M_q / M_alpha) q, partly made up by the lift L_q q of the rotation itself. The path
   * therefore curves as if the plane were heavier, and the period stretches by
   *   sqrt(1 + (L_alpha M_q / M_alpha - L_q) / (m V))
   * (quasi-static pitch balance, derived for this test; the factor tends to 1 for a dense aircraft).
   * All four derivatives are taken from the element model by central differences about the trimmed glide.
   */
  function pitchDampingStretch(af: Airframe, env: Environment): number {
    const air = airOf(env);
    const trim = analyzeTrim(af, air);
    const a0 = trim.alphaDeg! * DEG;
    const speed = trim.speed!;
    const at = (alpha: number, q: number): { lift: number; moment: number } => {
      const out = createAeroLoads();
      aeroLoads(af, [speed * Math.cos(alpha), -speed * Math.sin(alpha), 0], [0, 0, q], air, out);
      return { lift: out.force[0] * Math.sin(alpha) + out.force[1] * Math.cos(alpha), moment: out.moment[2] };
    };
    const da = 0.5 * DEG;
    const dq = 0.2;
    const liftAlpha = (at(a0 + da, 0).lift - at(a0 - da, 0).lift) / (2 * da);
    const momentAlpha = (at(a0 + da, 0).moment - at(a0 - da, 0).moment) / (2 * da);
    const liftRate = (at(a0, dq).lift - at(a0, -dq).lift) / (2 * dq);
    const momentRate = (at(a0, dq).moment - at(a0, -dq).moment) / (2 * dq);
    expect(momentAlpha).toBeLessThan(0);
    expect(momentRate).toBeLessThan(0);
    return Math.sqrt(1 + ((liftAlpha * momentRate) / momentAlpha - liftRate) / (af.mass * speed));
  }

  it('dart: the period is the Lanchester value stretched by pitch damping; damping ratio 1 / (sqrt(2) L/D) within 50 %', () => {
    const env = tower(60);
    const trim = analyzeTrim(dart, airOf(env));
    const lanchester = (Math.PI * Math.SQRT2 * trim.speed!) / g;
    const { period, zeta } = phugoid(dart, env);
    within(period, lanchester * pitchDampingStretch(dart, env), 0.04);
    // Against the bare Lanchester value (the V5 target, +-15 %) this dart is 18 % slow: just outside.
    expect(period / lanchester).toBeGreaterThan(1.1);
    expect(period / lanchester).toBeLessThan(1.25);
    within(zeta, 1 / (Math.SQRT2 * trim.glideRatio!), 0.5);
  });

  it('glider: lighter on its wings and with a small static margin, its period is 60 % longer than Lanchester\'s', () => {
    const env = tower(60);
    const trim = analyzeTrim(glider, airOf(env));
    const lanchester = (Math.PI * Math.SQRT2 * trim.speed!) / g;
    const { period, zeta } = phugoid(glider, env);
    // 6 %: at this amplitude the first swings are a few percent slower than small ones.
    within(period, lanchester * pitchDampingStretch(glider, env), 0.06);
    expect(period / lanchester).toBeGreaterThan(1.4);
    expect(period / lanchester).toBeLessThan(1.8);
    // Lightly damped: below the 1 / (sqrt(2) L/D) estimate, which assumes the classical phugoid.
    expect(zeta).toBeGreaterThan(0.03);
    expect(zeta).toBeLessThan(1 / (Math.SQRT2 * trim.glideRatio!));
  });
});

describe('V7 roll-rate decay at 5 m/s from 10 rad/s', () => {
  it('is exponential with the time constant of the linear estimate (roll inertia / roll damping)', () => {
    const env = tower(20);
    const air = airOf(env);
    const trim = analyzeTrim(dart, air);
    expect(trim.speed!).toBeGreaterThan(4.5);
    expect(trim.speed!).toBeLessThan(5.5);
    // Linear estimate: L_p from the element model itself, by central difference about the trimmed glide.
    const a = trim.alphaDeg! * DEG;
    const v: Vec3 = [trim.speed! * Math.cos(a), -trim.speed! * Math.sin(a), 0];
    const plus = createAeroLoads();
    const minus = createAeroLoads();
    aeroLoads(dart, v, [0.5, 0, 0], air, plus);
    aeroLoads(dart, v, [-0.5, 0, 0], air, minus);
    const damping = plus.moment[0] - minus.moment[0];
    expect(damping).toBeLessThan(0);
    const tau = (dart.inertia[0] + dart.apparentInertia[0]) / -damping;
    // Doc 02 section 1.2: 7 - 34 ms for the rigid body alone, longer with the air's apparent inertia.
    expect(tau).toBeGreaterThan(0.007);
    expect(tau).toBeLessThan(0.1);

    const r = simulateFlight(dart, trimmedLaunch(dart, env), env, { envId: env.id }, 1, { omega0: [10, 0, 0], sampleHz: 2000, maxTime: 0.5 });
    // Fit ln p against t over the first one and a half time constants.
    let n = 0, st = 0, sy = 0, stt = 0, sty = 0, syy = 0;
    for (const s of r.samples) {
      if (s.t > 1.5 * tau) break;
      const y = Math.log(s.omega[0]);
      n++;
      st += s.t;
      sy += y;
      stt += s.t * s.t;
      sty += s.t * y;
      syy += y * y;
    }
    expect(n).toBeGreaterThan(20);
    const slope = (n * sty - st * sy) / (n * stt - st * st);
    const r2 = (n * sty - st * sy) ** 2 / ((n * stt - st * st) * (n * syy - sy * sy));
    expect(r2).toBeGreaterThan(0.99);
    within(-1 / slope, tau, 0.3);
    // After two time constants little is left. (Later the bank it has gathered feeds a slow roll-yaw swing,
    // so the rate does not stay at zero.)
    expect(Math.abs(sampleAt(r, 2 * tau).omega[0])).toBeLessThan(0.3 * 10);
  });
});

describe('V8 step-size convergence', () => {
  it('distance and airtime at 1 ms and at 0.25 ms differ by less than 0.5 % in calm air', () => {
    for (const [af, launch] of [[dart, throwOf(8, 5)], [glider, throwOf(5, 0)], [dart, throwOf(12, 20)]] as const) {
      const env = stillAir(gym);
      const coarse = simulateFlight(af, launch, env, { envId: 'gym' }, 1);
      const fine = simulateFlight(af, launch, env, { envId: 'gym' }, 1, { dt: 0.25e-3 });
      expect(coarse.dt).toBe(1e-3);
      expect(fine.dt).toBe(0.25e-3);
      within(coarse.metrics.distance, fine.metrics.distance, 0.005);
      within(coarse.metrics.airtime, fine.metrics.airtime, 0.005);
      within(coarse.metrics.maxHeight, fine.metrics.maxHeight, 0.005);
    }
  });
});

describe('V9 casual indoor throw: 8 m/s, 5 degrees up, 1.8 m, dart, in the gym', () => {
  it('flies 6 - 15 m in 1.5 - 3.5 s and lands on the floor', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = simulateFlight(dart, throwOf(8, 5), gym, { envId: 'gym' }, seed);
      expect(r.outcome).toBe('ground');
      expect(r.metrics.distance).toBeGreaterThan(6);
      expect(r.metrics.distance).toBeLessThan(15);
      expect(r.metrics.airtime).toBeGreaterThan(1.5);
      expect(r.metrics.airtime).toBeLessThan(3.5);
      expect(Math.abs(r.metrics.lateral)).toBeLessThan(1.5);
      expect(r.metrics.maxHeight).toBeLessThan(gym.bounds!.ceiling);
    }
  });
});

describe('V10 / V11 time aloft: fixture glider thrown hard and almost straight up in the hangar', () => {
  it('27 m/s at 85 degrees: peak 11 - 22 m, 20 - 32 s aloft, never more than 35 s', () => {
    for (const seed of [1, 2, 3]) {
      const r = simulateFlight(glider, throwOf(27, 85), hangar, { envId: 'hangar' }, seed);
      expect(r.metrics.maxHeight).toBeGreaterThan(11);
      expect(r.metrics.maxHeight).toBeLessThan(22);
      expect(r.metrics.airtime).toBeGreaterThan(20);
      expect(r.metrics.airtime).toBeLessThan(32);
      expect(r.outcome).toBe('ground');
    }
  });

  it('20 m/s: shorter than the elite throw (target 12 - 17 s; this fixture stays up a little longer)', () => {
    const elite = simulateFlight(glider, throwOf(27, 85), hangar, { envId: 'hangar' }, 1);
    const good = simulateFlight(glider, throwOf(20, 85), hangar, { envId: 'hangar' }, 1);
    expect(good.metrics.airtime).toBeLessThan(elite.metrics.airtime);
    expect(good.metrics.airtime).toBeGreaterThan(12);
    expect(good.metrics.airtime).toBeLessThan(21);
  });

  it('no throw of the glider stays up longer than 35 s', () => {
    for (const speed of [15, 22, 30]) {
      for (const pitch of [60, 75, 90]) {
        expect(simulateFlight(glider, throwOf(speed, pitch), hangar, { envId: 'hangar' }, 4).metrics.airtime).toBeLessThan(35);
      }
    }
  });
});

describe('V12 / V13 distance: fixture dart thrown hard', () => {
  it('stays far below the record band and never exceeds it', () => {
    // Target for the best dart: 60 - 100 m in 5 - 7 s at 25 - 30 m/s. The fixture dart cannot come near:
    // the element model's darts glide at L/D 3 - 4 and any up-trim that gives a glide loops at these speeds.
    // The test pins the ceiling (nothing may ever beat the record band) and records what the fixture reaches.
    let best = 0;
    for (const elevatorDeg of [0, 1, 3]) {
      const af = simDart({ elevatorDeg });
      for (const speed of [15, 27]) {
        for (const pitch of [10, 20, 35, 45]) {
          const r = simulateFlight(af, throwOf(speed, pitch), stillAir(hangar), { envId: 'hangar' }, 1);
          best = Math.max(best, r.metrics.distance);
          expect(r.metrics.distance).toBeLessThan(105);
        }
      }
    }
    expect(best).toBeGreaterThan(10);
    expect(best).toBeLessThan(60);
  });
});

describe('determinism', () => {
  it('the same seed gives a bit-identical result', () => {
    const a = simulateFlight(dart, throwOf(6, 0), hill, { envId: 'hill' }, 42);
    const b = simulateFlight(dart, throwOf(6, 0), hill, { envId: 'hill' }, 42);
    expect(b).toEqual(a);
    expect(a.seed).toBe(42);
    expect(a.sampleHz).toBe(120);
  });

  it('different seeds differ in turbulent air', () => {
    const a = simulateFlight(dart, throwOf(6, 0), hill, { envId: 'hill' }, 1);
    const b = simulateFlight(dart, throwOf(6, 0), hill, { envId: 'hill' }, 2);
    expect(Math.abs(a.metrics.distance - b.metrics.distance) + Math.abs(a.metrics.airtime - b.metrics.airtime)).toBeGreaterThan(0.01);
  });

  it('different seeds are identical in zero wind', () => {
    const a = simulateFlight(dart, throwOf(8, 5), meadow, { envId: 'meadow', windSpeed: 0 }, 1);
    const b = simulateFlight(dart, throwOf(8, 5), meadow, { envId: 'meadow', windSpeed: 0 }, 2);
    expect({ ...b, seed: 0 }).toEqual({ ...a, seed: 0 });
  });

  it('indoors the drafts are small: seeds agree within a few percent', () => {
    for (const env of [classroom, gym]) {
      const launch = env === classroom ? throwOf(5, 5) : throwOf(8, 5);
      const a = simulateFlight(dart, launch, env, { envId: env.id }, 1);
      const b = simulateFlight(dart, launch, env, { envId: env.id }, 2);
      expect(a.samples).not.toEqual(b.samples);
      within(a.metrics.distance, b.metrics.distance, 0.08);
      within(a.metrics.airtime, b.metrics.airtime, 0.08);
    }
  });
});

describe('wind', () => {
  /** A constant, uniform wind everywhere. */
  const uniform = (w: Vec3): WindField => {
    const fill = (out: [number, number, number] = [0, 0, 0]): Vec3 => {
      out[0] = w[0];
      out[1] = w[1];
      out[2] = w[2];
      return out;
    };
    return { sample: (_p, _t, out) => fill(out), mean: (_p, _t, out) => fill(out) };
  };

  it('a flight in uniform wind is the still-air flight seen from the moving air', () => {
    const env = tower(8);
    const spin: Vec3 = [3, 1, 0];
    const still = simulateFlight(dart, throwOf(6, 0, { aoaDeg: 5 }), env, { envId: env.id }, 1, { omega0: spin });
    for (const wind of [3, -2]) {
      // Same airspeed and attitude: the ground speed is the airspeed plus the wind.
      const moving = simulateFlight(dart, throwOf(6 + wind, 0, { aoaDeg: 5 }), env, { envId: env.id }, 1, { omega0: spin, wind: uniform([wind, 0, 0]) });
      within(moving.metrics.airtime, still.metrics.airtime, 1e-6);
      expect(moving.samples.length).toBe(still.samples.length);
      for (let i = 0; i < still.samples.length; i++) {
        const a = still.samples[i];
        const b = moving.samples[i];
        // Equal up to the truncation error of the step (micrometres), which differs between the two frames.
        expect(b.pos[0] - wind * b.t).toBeCloseTo(a.pos[0], 5);
        expect(b.pos[1]).toBeCloseTo(a.pos[1], 5);
        expect(b.pos[2]).toBeCloseTo(a.pos[2], 5);
        expect(b.airspeed).toBeCloseTo(a.airspeed, 5);
        for (let k = 0; k < 4; k++) expect(b.quat[k]).toBeCloseTo(a.quat[k], 5);
        expect(b.wind).toEqual([wind, 0, 0]);
      }
      expect(moving.metrics.downrange - still.metrics.downrange).toBeCloseTo(wind * still.metrics.airtime, 4);
    }
  });

  it('a sudden gust pushes the plane at once through the apparent mass of the air around it', () => {
    const env = tower(8);
    const launch = trimmedLaunch(glider, env);
    const gustAt = 0.1;
    const gust: Vec3 = [0, 0.5, 0];
    const stepWind: WindField = {
      sample: (_p, t, out = [0, 0, 0]) => {
        out[0] = 0;
        out[1] = t >= gustAt - 1e-9 ? gust[1] : 0;
        out[2] = 0;
        return out;
      },
      mean: (_p, _t, out = [0, 0, 0]) => out,
    };
    const options = { sampleHz: 1000, maxTime: 0.3 };
    const calm = simulateFlight(glider, launch, env, { envId: env.id }, 1, options);
    const hit = simulateFlight(glider, launch, env, { envId: env.id }, 1, { ...options, wind: stepWind });
    const i = Math.round(gustAt * 1000);
    // Identical until the step in which the gust arrives.
    expect(hit.samples[i - 1].vel).toEqual(calm.samples[i - 1].vel);
    // In that one millisecond the velocity jumps by (m + A)^-1 A times the gust (body axes); the aerodynamic
    // response has hardly begun (its time constant is tens of milliseconds).
    const q = calm.samples[i].quat;
    const M = addM([glider.mass, 0, 0, 0, glider.mass, 0, 0, 0, glider.mass], glider.apparentMass);
    const expected = quatRotate(q, mat3MulVec(mat3Inverse(M), mat3MulVec(glider.apparentMass, quatRotateInv(q, gust))));
    expect(expected[1]).toBeGreaterThan(0.1 * gust[1]);
    const jump = [0, 1, 2].map((k) => hit.samples[i].vel[k] - calm.samples[i].vel[k]);
    within(jump[1], expected[1], 0.1);
    expect(Math.abs(jump[0] - expected[0])).toBeLessThan(0.1 * expected[1]);
    // Then the wing's lift takes over and carries the plane on up with the rising air.
    const later = hit.samples[hit.samples.length - 1].vel[1] - calm.samples[calm.samples.length - 1].vel[1];
    expect(later).toBeGreaterThan(1.5 * jump[1]);
    expect(later).toBeLessThan(1.3 * gust[1]);
  });

  it('a headwind shortens and a tailwind lengthens a glide over the ground', () => {
    const open: Environment = { ...releasedAt(meadow, 15), wind: { ...meadow.wind, thermals: [] } };
    const trim = analyzeTrim(glider, airOf(open));
    const sink = trim.sinkRate!;
    const level = Math.sqrt(trim.speed! ** 2 - sink ** 2);
    const fly = (towardDeg: number | null): FlightResult => {
      const conditions = { envId: 'meadow', windSpeed: towardDeg === null ? 0 : 2, windTowardDeg: towardDeg ?? 0, gustiness: 0 };
      // Release in the trimmed glide relative to the air: ground velocity = air velocity + wind at the release point.
      const wind = createWindField(resolveWind(open, conditions), 5, open).mean(open.launch, 0)[0];
      const vx = level + wind;
      const launch = throwOf(Math.hypot(vx, sink), -Math.atan2(sink, vx) / DEG, { aoaDeg: trim.alphaDeg! + (Math.atan2(sink, vx) - Math.atan2(sink, level)) / DEG });
      return simulateFlight(glider, launch, open, conditions, 5);
    };
    const calm = fly(null);
    const tail = fly(0);
    const head = fly(180);
    expect(tail.metrics.downrange).toBeGreaterThan(1.2 * calm.metrics.downrange);
    expect(head.metrics.downrange).toBeLessThan(0.8 * calm.metrics.downrange);
    // Through the air the glide is the same: the glide ratio relative to the air does not change with a steady wind.
    within(tail.metrics.glideRatio!, calm.metrics.glideRatio!, 0.15);
    // The wind is recorded in the samples and blows the right way.
    expect(tail.samples[10].wind[0]).toBeGreaterThan(1);
    expect(head.samples[10].wind[0]).toBeLessThan(-1);
    expect(calm.samples[10].wind).toEqual([0, 0, 0]);
  });

  it('cliff lift holds a slow glider aloft longer than still air', () => {
    for (const seed of [1, 2]) {
      const still = simulateFlight(glider, throwOf(3, 0), cliff, { envId: 'cliff', windSpeed: 0, gustiness: 0 }, seed);
      const lifted = simulateFlight(glider, throwOf(3, 0), cliff, { envId: 'cliff', windSpeed: 0.75, gustiness: 0 }, seed);
      // In still air it glides down to the sea, 25 m below the cliff top.
      expect(still.outcome).toBe('ground');
      expect(still.events[still.events.length - 1].pos[1]).toBeLessThan(-20);
      expect(still.metrics.airtime).toBeGreaterThan(30);
      expect(lifted.metrics.airtime).toBeGreaterThan(still.metrics.airtime + 5);
      // The air around it rose on average.
      let lift = 0;
      for (const s of lifted.samples) lift += s.wind[1];
      expect(lift / lifted.samples.length).toBeGreaterThan(0.05);
    }
  });

  it('the meadow thermal lifts a plane that flies through its core', () => {
    const th = meadow.wind.thermals[0];
    const calm = { envId: 'meadow', windSpeed: 0, gustiness: 0 };
    const aim = throwOf(4, 0, { yawDeg: Math.atan2(th.z, th.x) / DEG });
    const through = simulateFlight(glider, aim, meadow, calm, 1);
    const without = simulateFlight(glider, aim, { ...meadow, wind: { ...meadow.wind, thermals: [] } }, calm, 1);
    expect(through.metrics.airtime).toBeGreaterThan(1.15 * without.metrics.airtime);
    expect(through.metrics.distance).toBeGreaterThan(1.1 * without.metrics.distance);
    let peak = 0;
    for (const s of through.samples) peak = Math.max(peak, s.wind[1]);
    expect(peak).toBeGreaterThan(0.25);
    expect(peak).toBeLessThan(0.6);
  });
});

describe('contact and termination', () => {
  it('a wall ends the flight at the wall, a ceiling at the ceiling', () => {
    const b = classroom.bounds!;
    const wall = simulateFlight(dart, throwOf(6, 5), classroom, { envId: 'classroom' }, 1);
    expect(wall.outcome).toBe('wall');
    const hit = wall.events[wall.events.length - 1];
    expect(hit.kind).toBe('wall');
    expect(hit.pos[0]).toBeCloseTo(b.xMax, 3);
    expect(wall.metrics.distance).toBeCloseTo(Math.hypot(hit.pos[0], hit.pos[2]), 9);
    // The centre of gravity stops short of the wall by the nose length.
    expect(wall.samples[wall.samples.length - 1].pos[0]).toBeLessThan(b.xMax - 0.05);

    const ceiling = simulateFlight(dart, throwOf(9, 40), classroom, { envId: 'classroom' }, 1);
    expect(ceiling.outcome).toBe('ceiling');
    expect(ceiling.events[ceiling.events.length - 1].pos[1]).toBeCloseTo(b.ceiling, 3);
    expect(ceiling.metrics.maxHeight).toBeLessThan(b.ceiling);

    const side = simulateFlight(dart, throwOf(6, 5, { yawDeg: 60 }), classroom, { envId: 'classroom' }, 1);
    expect(side.outcome).toBe('wall');
    expect(side.events[side.events.length - 1].pos[2]).toBeCloseTo(b.zMax, 3);
  });

  it('the touch point is interpolated inside the step: the last sample is the exact instant of contact', () => {
    const r = simulateFlight(dart, throwOf(8, 5), stillAir(gym), { envId: 'gym' }, 1);
    const n = r.samples.length;
    const end = r.samples[n - 1];
    expect(end.t).toBe(r.metrics.airtime);
    expect(end.t).toBeGreaterThan(r.samples[n - 2].t);
    expect(end.t - r.samples[n - 2].t).toBeLessThanOrEqual(1 / 120 + 1e-9);
    // Not a multiple of the step, in general.
    expect(Math.abs(end.t * 1000 - Math.round(end.t * 1000))).toBeGreaterThan(1e-6);
    const touch = r.events[r.events.length - 1].pos;
    expect(Math.abs(touch[1])).toBeLessThan(1e-4);
    // The same flight at a quarter of the step lands at the same instant to within a few microseconds... of flight path.
    const fine = simulateFlight(dart, throwOf(8, 5), stillAir(gym), { envId: 'gym' }, 1, { dt: 0.25e-3 });
    expect(Math.abs(fine.metrics.airtime - r.metrics.airtime)).toBeLessThan(2e-3);
  });

  it('terrain: a flight down the hill ends on the hillside, below the release ground', () => {
    const env = stillAir(hill);
    const r = simulateFlight(glider, throwOf(4, 0), env, { envId: 'hill' }, 1);
    expect(r.outcome).toBe('ground');
    const touch = r.events[r.events.length - 1].pos;
    expect(touch[1]).toBeLessThan(-1);
    if (env.terrain.kind !== 'hill') throw new Error('hill expected');
    const k = Math.PI / env.terrain.halfWidth;
    const ground = 0.5 * env.terrain.height * (Math.cos(k * (touch[0] - env.terrain.crestX)) - Math.cos(k * env.terrain.crestX));
    expect(touch[1]).toBeCloseTo(ground, 3);
    // Longer than the same throw over level ground.
    const level = simulateFlight(glider, throwOf(4, 0), stillAir(meadow), { envId: 'meadow' }, 1);
    expect(r.metrics.airtime).toBeGreaterThan(1.5 * level.metrics.airtime);
  });

  it('stops after 60 s when nothing was touched, and after maxTime when asked', () => {
    const forever = simulateFlight(glider, trimmedLaunch(glider, tower(400)), tower(400), { envId: 'meadow' }, 1);
    expect(forever.outcome).toBe('timeout');
    expect(forever.metrics.airtime).toBeCloseTo(60, 9);
    expect(forever.events[forever.events.length - 1].kind).toBe('timeout');
    expect(forever.samples.length).toBe(60 * 120 + 1);
    const short = simulateFlight(glider, trimmedLaunch(glider, tower(400)), tower(400), { envId: 'meadow' }, 1, { maxTime: 2 });
    expect(short.metrics.airtime).toBeCloseTo(2, 9);
  });

  it('an airframe the integrator cannot hold (almost no inertia) ends the flight instead of returning NaN', () => {
    const feather: Airframe = {
      ...dart,
      inertia: dart.inertia.map((v) => v * 1e-12) as unknown as Mat3,
      apparentInertia: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
    const r = simulateFlight(feather, throwOf(8, 5, { aoaDeg: 3 }), stillAir(gym), { envId: 'gym' }, 1);
    expect(r.metrics.airtime).toBeLessThan(60);
    for (const s of r.samples) {
      for (const v of [...s.pos, ...s.vel, ...s.quat, ...s.omega, s.airspeed, s.alpha, s.cl, s.cd]) expect(Number.isFinite(v)).toBe(true);
    }
    for (const v of Object.values(r.metrics)) if (v !== null) expect(Number.isFinite(v)).toBe(true);
    expect(r.diagnosis.length).toBeGreaterThan(0);
  });

  it('a plane released inside the floor does not fly', () => {
    const r = simulateFlight(dart, throwOf(5, 0), releasedAt(stillAir(gym), 0.001), { envId: 'gym' }, 1);
    expect(r.outcome).toBe('ground');
    expect(r.metrics.airtime).toBe(0);
    expect(r.samples).toHaveLength(1);
    expect(r.diagnosis.length).toBeGreaterThan(0);
  });
});

describe('samples, events and metrics', () => {
  const r = simulateFlight(glider, throwOf(7, 10), releasedAt(stillAir(hangar), 6), { envId: 'hangar' }, 1);

  it('samples come at 120 Hz plus the final instant, with consistent fields', () => {
    for (let i = 0; i < r.samples.length - 1; i++) expect(r.samples[i].t).toBeCloseTo(i / 120, 12);
    for (const s of r.samples) {
      expect(Math.abs(Math.hypot(...s.quat) - 1)).toBeLessThan(1e-12);
      // Still air: airspeed is ground speed, and alpha / beta follow from the body-frame velocity.
      expect(s.airspeed).toBeCloseTo(Math.hypot(...s.vel), 9);
      const body = quatRotateInv(s.quat, s.vel);
      expect(s.alpha).toBeCloseTo(Math.atan2(-body[1], body[0]), 9);
      expect(s.beta).toBeCloseTo(Math.asin(body[2] / s.airspeed), 9);
      expect(s.wind).toEqual([0, 0, 0]);
      expect(s.cd).toBeGreaterThan(0);
    }
  });

  it('events are in time order: launch first, the touch last, apex at the highest point, stalls and recoveries alternating', () => {
    expect(r.events[0].kind).toBe('launch');
    expect(r.events[r.events.length - 1].kind).toBe(r.outcome);
    for (let i = 1; i < r.events.length; i++) expect(r.events[i].t).toBeGreaterThanOrEqual(r.events[i - 1].t);
    const apex = r.events.filter((e) => e.kind === 'apex');
    expect(apex).toHaveLength(1);
    expect(apex[0].pos[1]).toBeCloseTo(r.metrics.maxHeight, 9);
    let highest = 0;
    for (const s of r.samples) highest = Math.max(highest, s.pos[1]);
    expect(r.metrics.maxHeight).toBeGreaterThanOrEqual(highest - 1e-9);
    expect(r.metrics.maxHeight).toBeLessThan(highest + 1e-3);
    const stalls = r.events.filter((e) => e.kind === 'stall' || e.kind === 'recover').map((e) => e.kind);
    expect(stalls.length).toBeGreaterThan(1);
    stalls.forEach((k, i) => expect(k).toBe(i % 2 === 0 ? 'stall' : 'recover'));
    expect(r.metrics.stallCount).toBe(stalls.filter((k) => k === 'stall').length);
    // At a stall event the whole-plane angle of attack is at the wing's stall angle.
    const stallAngle = glider.surfaces[0].alphaStall;
    const first = r.events.find((e) => e.kind === 'stall')!;
    expect(Math.abs(Math.abs(sampleAt(r, first.t).alpha) - stallAngle)).toBeLessThan(2 * DEG);
  });

  it('a descending launch has no apex event', () => {
    const down = simulateFlight(dart, throwOf(6, -10), stillAir(gym), { envId: 'gym' }, 1);
    expect(down.events.some((e) => e.kind === 'apex')).toBe(false);
    expect(down.metrics.maxHeight).toBeCloseTo(gym.launch[1], 9);
  });

  it('metrics agree with the samples', () => {
    const m = r.metrics;
    const end = r.samples[r.samples.length - 1];
    const touch = r.events[r.events.length - 1].pos;
    expect(m.airtime).toBe(end.t);
    expect(m.downrange).toBeCloseTo(touch[0] - r.samples[0].pos[0], 9);
    expect(m.lateral).toBeCloseTo(touch[2] - r.samples[0].pos[2], 9);
    expect(m.distance).toBeCloseTo(Math.hypot(m.downrange, m.lateral), 9);
    expect(m.landingSpeed).toBeCloseTo(Math.hypot(...end.vel), 9);
    let path = 0;
    let speedTime = 0;
    let fastest = 0;
    for (let i = 1; i < r.samples.length; i++) {
      const a = r.samples[i - 1];
      const b = r.samples[i];
      path += Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]);
      speedTime += 0.5 * (a.airspeed + b.airspeed) * (b.t - a.t);
      fastest = Math.max(fastest, Math.hypot(...b.vel));
    }
    within(m.pathLength, path, 1e-3);
    within(m.meanAirspeed, speedTime / m.airtime, 1e-3);
    within(m.maxSpeed, Math.max(fastest, 7), 1e-3);
    const air = airOf(hangar);
    expect(m.reynolds).toBeCloseTo((air.rho * m.meanAirspeed * glider.ref.mac) / air.mu, 6);
    expect(m.pathLength).toBeGreaterThan(m.distance);
  });

  it('a flight that never settles reports no steady glide', () => {
    const short = simulateFlight(dart, throwOf(8, 5), stillAir(gym), { envId: 'gym' }, 1);
    expect(short.metrics.glideRatio).toBeNull();
    expect(short.metrics.sinkRate).toBeNull();
    expect(short.metrics.glideAlpha).toBeNull();
    expect(short.metrics.glideSpeed).toBeNull();
  });

  it('a tumbling sheet is reported as tumbling, a loop is not', () => {
    // Centre of gravity far behind the neutral point: the plane flips end over end.
    const tailHeavy = simGlider({ clip: { mass: 0.004, x: 0 } });
    expect(analyzeTrim(tailHeavy, airOf(hangar)).pitchStable).toBe(false);
    const tumble = simulateFlight(tailHeavy, throwOf(5, 10), releasedAt(stillAir(hangar), 10), { envId: 'hangar' }, 1);
    expect(tumble.events.some((e) => e.kind === 'tumble')).toBe(true);
    const loop = simulateFlight(dart, throwOf(14, 20), stillAir(hangar), { envId: 'hangar' }, 1);
    expect(loop.events.some((e) => e.kind === 'tumble')).toBe(false);
  });
});

describe('sampleAt', () => {
  const r = simulateFlight(dart, throwOf(8, 5, { rollDeg: 20 }), stillAir(gym), { envId: 'gym' }, 1);

  it('returns the samples themselves at their own times and clamps outside the flight', () => {
    expect(sampleAt(r, r.samples[30].t)).toEqual(r.samples[30]);
    expect(sampleAt(r, -1)).toBe(r.samples[0]);
    expect(sampleAt(r, 1e3)).toBe(r.samples[r.samples.length - 1]);
    expect(sampleAt(r, r.metrics.airtime)).toBe(r.samples[r.samples.length - 1]);
  });

  it('interpolates between samples: position on the chord, unit attitude, values between the neighbours', () => {
    for (const i of [0, 17, 100, r.samples.length - 2]) {
      const a = r.samples[i];
      const b = r.samples[i + 1];
      for (const f of [0.25, 0.5, 0.9]) {
        const s = sampleAt(r, a.t + f * (b.t - a.t));
        expect(s.t).toBeCloseTo(a.t + f * (b.t - a.t), 12);
        for (let k = 0; k < 3; k++) expect(s.pos[k]).toBeCloseTo(a.pos[k] + f * (b.pos[k] - a.pos[k]), 12);
        expect(Math.hypot(...s.quat)).toBeCloseTo(1, 12);
        expect(s.airspeed).toBeGreaterThanOrEqual(Math.min(a.airspeed, b.airspeed) - 1e-12);
        expect(s.airspeed).toBeLessThanOrEqual(Math.max(a.airspeed, b.airspeed) + 1e-12);
      }
    }
  });

  it('is close to the true trajectory: a flight sampled at 1 kHz agrees within a millimetre', () => {
    const dense = simulateFlight(dart, throwOf(8, 5, { rollDeg: 20 }), stillAir(gym), { envId: 'gym' }, 1, { sampleHz: 1000 });
    for (let i = 3; i < dense.samples.length - 1; i += 37) {
      const truth = dense.samples[i];
      const s = sampleAt(r, truth.t);
      expect(Math.hypot(s.pos[0] - truth.pos[0], s.pos[1] - truth.pos[1], s.pos[2] - truth.pos[2])).toBeLessThan(1e-3);
    }
  });
});

describe('speed', () => {
  it('computes a 10 s flight in well under 50 ms', () => {
    const env = releasedAt(hangar, 6);
    const launch = throwOf(3, -10, { aoaDeg: 6 });
    let airtime = 0;
    let best = Infinity;
    // Best of several runs: the first includes JIT warm-up, and a shared machine can be preempted.
    for (let rep = 0; rep < 7; rep++) {
      const start = performance.now();
      airtime = simulateFlight(glider, launch, env, { envId: 'hangar' }, 1).metrics.airtime;
      best = Math.min(best, performance.now() - start);
    }
    expect(airtime).toBeGreaterThan(10);
    expect(airtime).toBeLessThan(11);
    expect(best).toBeLessThan(50);
  });
});
