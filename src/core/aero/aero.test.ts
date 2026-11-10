import { describe, expect, it } from 'vitest';
import { buildAirframe } from '../airframe';
import { DEG } from '../math';
import {
  a4AreaDelta, a4AreaPlate, dartFixture, DART_TRIM, dihedralPlateModel, flatDeltaModel, flatPlateModel, gliderFixture,
  NEUTRAL_TRIM, TEST_AIR, trimOf,
} from '../testing/fixtures';
import type { Airframe, Vec3 } from '../types';
import { flapCmDelta, flapTau } from './flap';
import { aeroLoads, aeroLoadsDetailed, bendTerms, createAeroLoads, slipLoadingWeight } from './loads';

const AIR = TEST_AIR;
const NU = AIR.mu / AIR.rho;
const STILL: Vec3 = [0, 0, 0];

/** Body-frame velocity through still air at angle of attack `alpha` and sideslip `beta` (radians). */
const windVelocity = (speed: number, alpha: number, beta = 0): Vec3 => [
  speed * Math.cos(alpha) * Math.cos(beta),
  -speed * Math.sin(alpha) * Math.cos(beta),
  speed * Math.sin(beta),
];

function loadsAt(af: Airframe, v: Vec3, omega: Vec3 = STILL) {
  const out = createAeroLoads();
  aeroLoads(af, v, omega, AIR, out);
  return out;
}

const qS = (af: Airframe, speed: number): number => 0.5 * AIR.rho * speed * speed * af.ref.area;
const friction = (re: number): number => 2.656 / Math.sqrt(re) + 0.006;

describe('thin-airfoil flap functions', () => {
  it('reproduce the table of doc 01 section 8', () => {
    const table: [number, number, number][] = [
      // E, tau, Cm_delta
      [0.05, 0.282, -0.414],
      [0.1, 0.396, -0.54],
      [0.15, 0.481, -0.607],
      [0.2, 0.55, -0.64],
      [0.3, 0.661, -0.642],
    ];
    for (const [e, tau, cm] of table) {
      expect(flapTau(e)).toBeCloseTo(tau, 3);
      expect(flapCmDelta(e)).toBeCloseTo(cm, 3);
      // dCl/d(delta) = 2 pi tau, as tabulated (the table rounds tau first).
      expect(2 * Math.PI * flapTau(e)).toBeCloseTo([1.77, 2.49, 3.02, 3.46, 4.15][table.findIndex((r) => r[0] === e)], 1);
    }
    expect(flapTau(0)).toBeCloseTo(0, 12);
    expect(flapTau(1)).toBeCloseTo(1, 12);
  });
});

describe('single plate, straight flow', () => {
  const af = buildAirframe(a4AreaPlate(3), NEUTRAL_TRIM);
  const chord = af.ref.mac;
  const speed = (8e4 * NU) / chord;
  const s = af.surfaces[0];

  it('normal force follows CN = Kp sin a cos a + Kv sin² a below the stall, along the plate normal', () => {
    for (const deg of [1, 3, 6, 10, 12]) {
      const a = deg * DEG;
      const out = loadsAt(af, windVelocity(speed, a));
      const cn = s.kp * Math.sin(a) * Math.cos(a) + s.kv * Math.sin(a) ** 2;
      expect(out.force[1] / qS(af, speed)).toBeCloseTo(cn, 10);
      // In-plane force is friction only: no leading-edge suction.
      expect(out.force[0] / qS(af, speed)).toBeCloseTo(-friction(8e4) * Math.cos(a), 10);
      expect(Math.abs(out.force[2])).toBeLessThan(1e-15);
      expect(Math.abs(out.moment[0])).toBeLessThan(1e-15);
      expect(Math.abs(out.moment[1])).toBeLessThan(1e-15);
    }
  });

  it('is the bluff plate at 90 degrees and past the stall blend', () => {
    const flat = loadsAt(af, windVelocity(speed, 90 * DEG));
    expect(flat.force[1] / qS(af, speed)).toBeCloseTo(1.17, 10);
    expect(Math.abs(flat.force[0])).toBeLessThan(1e-12); // friction vanishes with the in-plane speed
    const a = 40 * DEG;
    const post = loadsAt(af, windVelocity(speed, a));
    expect(post.force[1] / qS(af, speed)).toBeCloseTo((1.17 * Math.sin(a)) / (0.56 + 0.44 * Math.sin(a)), 10);
  });

  it('blends with the smoothstep of doc 01 section 10.2 inside the stall band', () => {
    const a = s.alphaStall + 0.3 * s.stallWidth;
    const t = 0.3;
    const sep = t * t * (3 - 2 * t);
    const attached = s.kp * Math.sin(a) * Math.cos(a) + s.kv * Math.sin(a) ** 2;
    const plate = (s.cd90 * Math.sin(a)) / (0.56 + 0.44 * Math.sin(a));
    const out = loadsAt(af, windVelocity(speed, a));
    expect(out.force[1] / qS(af, speed)).toBeCloseTo((1 - sep) * attached + sep * plate, 9);
  });

  it('is antisymmetric in incidence and symmetric fore and aft', () => {
    for (const deg of [4, 15, 50]) {
      const up = loadsAt(af, windVelocity(speed, deg * DEG));
      const down = loadsAt(af, windVelocity(speed, -deg * DEG));
      expect(down.force[1]).toBeCloseTo(-up.force[1], 14);
      expect(down.force[0]).toBeCloseTo(up.force[0], 14);
      expect(down.moment[2]).toBeCloseTo(-up.moment[2], 14);
      // Trailing edge first: same normal force, friction reversed, pitching moment mirrored.
      const back = loadsAt(af, windVelocity(speed, (180 - deg) * DEG));
      expect(back.force[1]).toBeCloseTo(up.force[1], 12);
      expect(back.force[0]).toBeCloseTo(-up.force[0], 12);
      expect(back.moment[2]).toBeCloseTo(-up.moment[2], 12);
    }
  });

  it('puts the centre of pressure at k0 + (0.5 - k0) sin a behind the upstream edge', () => {
    for (const deg of [2, 8, 30, 90]) {
      const a = deg * DEG;
      const detail = aeroLoadsDetailed(af, windVelocity(speed, a), STILL, AIR);
      const xcp = 0.25 + 0.25 * Math.sin(a);
      for (const e of detail.elements) expect(e.cp[0]).toBeCloseTo(chord * (1 - xcp), 10);
      const rev = aeroLoadsDetailed(af, windVelocity(speed, Math.PI - a), STILL, AIR);
      for (const e of rev.elements) expect(e.cp[0]).toBeCloseTo(chord * xcp, 10);
    }
  });

  it('vortex lift acts at mid-chord on a straight low-aspect-ratio wing', () => {
    const square = buildAirframe(a4AreaPlate(1), NEUTRAL_TRIM);
    const c = square.ref.mac;
    const sq = square.surfaces[0];
    const a = 20 * DEG;
    const cnp = sq.kp * Math.sin(a) * Math.cos(a);
    const cnv = sq.kv * Math.sin(a) ** 2;
    const xcp = (cnp * (0.25 + 0.25 * Math.sin(a)) + cnv * 0.5) / (cnp + cnv);
    const detail = aeroLoadsDetailed(square, windVelocity(5, a), STILL, AIR);
    expect(detail.elements[3].cp[0]).toBeCloseTo(c * (1 - xcp), 9);
    expect(cnv / (cnp + cnv)).toBeGreaterThan(0.3);
  });

  it('gives nothing at rest and never NaN', () => {
    const rest = loadsAt(af, STILL);
    expect(rest.force).toEqual([0, 0, 0]);
    expect(rest.moment).toEqual([0, 0, 0]);
    for (const v of [[0, 3, 0], [0, 0, 4], [1e-9, 0, 0], [-5, 0, 0], [0, -2, 0]] as Vec3[]) {
      const out = loadsAt(af, v, [3, -2, 5]);
      for (const x of [...out.force, ...out.moment]) expect(Number.isFinite(x)).toBe(true);
    }
  });
});

describe('element incidence in three dimensions', () => {
  it('uses the full in-plane speed: a strip sliding along its span keeps a small incidence (doc 01 verification note 1)', () => {
    const af = buildAirframe(flatPlateModel(0.2, 0.1), NEUTRAL_TRIM);
    // 5 m/s along the span, 0.05 m/s through the plate, almost no chordwise speed.
    const detail = aeroLoadsDetailed(af, [0.001, 0.05, 5], STILL, AIR);
    for (const e of detail.elements) {
      expect(e.incidence / DEG).toBeCloseTo(0.573, 3);
      expect(e.cn).toBeCloseTo(0.026, 3);
      expect(e.separation).toBe(0);
    }
  });

  it('loads stay continuous when the chordwise flow reverses', () => {
    const af = buildAirframe(dartFixture({ dihedralDeg: 10, keelSpreadDeg: 20 }), DART_TRIM);
    const out = createAeroLoads();
    let prev: number[] | null = null;
    let largest = 0;
    let scale = 0;
    // Swing the flight direction through "sideways" in steps of 0.02 degrees while pitching and rolling.
    for (let i = 0; i <= 2000; i++) {
      const beta = (70 + i * 0.02) * DEG;
      aeroLoads(af, windVelocity(5, 6 * DEG, beta), [2, 1, 3], AIR, out);
      const now = [...out.force, ...out.moment.map((m) => m / af.ref.mac)];
      if (prev) for (let k = 0; k < 6; k++) largest = Math.max(largest, Math.abs(now[k] - prev[k]));
      for (const x of now) scale = Math.max(scale, Math.abs(x));
      prev = now;
    }
    // A hard switch of the upstream edge would jump by a sizeable fraction of the load in a single step.
    expect(largest).toBeLessThan(0.01 * scale);
  });

  it('dihedral: lift scales with cos² of the dihedral angle', () => {
    const speed = 5;
    const a = 3 * DEG;
    // Aspect ratio 6: the projected aspect ratio stays above 3, so there is no vortex term to confuse the ratio.
    const flat = buildAirframe(dihedralPlateModel(0.6, 0.1, 0), NEUTRAL_TRIM);
    const base = loadsAt(flat, windVelocity(speed, a)).force[1] / flat.surfaces[0].kp;
    for (const deg of [10, 25, 40]) {
      const vee = buildAirframe(dihedralPlateModel(0.6, 0.1, deg), NEUTRAL_TRIM);
      expect(vee.surfaces[0].kv).toBe(0);
      const out = loadsAt(vee, windVelocity(speed, a));
      // Same true area; the lift slope follows the projected aspect ratio, so compare per unit Kp.
      const ratio = out.force[1] / vee.surfaces[0].kp / base;
      expect(ratio).toBeCloseTo(Math.cos(deg * DEG) ** 2, 2);
      expect(Math.abs(out.force[2])).toBeLessThan(1e-12);
    }
  });
});

describe('rate damping emerges from omega x r', () => {
  const speed = 5;

  it('roll rate is opposed, with the strip-theory size Clp = -Kp / 6 for a rectangular wing', () => {
    const b = 0.3;
    const c = 0.1;
    const af = buildAirframe(flatPlateModel(b, c), NEUTRAL_TRIM);
    const p = 2;
    const out = loadsAt(af, windVelocity(speed, 0), [p, 0, 0]);
    expect(out.moment[0]).toBeLessThan(0);
    const expected = -0.5 * AIR.rho * speed * af.surfaces[0].kp * p * ((c * b ** 3) / 12);
    expect(out.moment[0] / expected).toBeCloseTo(1, 2);
    expect(loadsAt(af, windVelocity(speed, 0), [-p, 0, 0]).moment[0]).toBeGreaterThan(0);
  });

  it('pitch rate is opposed; incidence is taken at the 3/4-chord point', () => {
    const b = 0.3;
    const c = 0.1;
    const af = buildAirframe(flatPlateModel(b, c), NEUTRAL_TRIM);
    const q = 3;
    const up = loadsAt(af, windVelocity(speed, 0), [0, 0, q]);
    // CG at mid-chord: the 3/4-chord point sinks at 0.25 c q, which is an incidence of 0.25 c q / V.
    const lift = 0.5 * AIR.rho * speed * speed * b * c * af.surfaces[0].kp * ((0.25 * c * q) / speed);
    expect(up.force[1] / lift).toBeCloseTo(1, 3);
    // Quasi-steady thin-airfoil theory: lift due to rotation about mid-chord has no moment about mid-chord.
    // (Applied at the quarter chord it would drive the rotation with lift * c / 4.)
    const still = loadsAt(af, windVelocity(speed, 0));
    expect(Math.abs(up.moment[2] - still.moment[2])).toBeLessThan(0.01 * lift * 0.25 * c);
    // Turning about a point ahead of mid-chord is damped: move the CG forward with a clip.
    const nosey = buildAirframe(flatPlateModel(b, c), trimOf({ clip: { mass: 0.002, x: c } }));
    const base = loadsAt(nosey, windVelocity(speed, 0));
    expect(loadsAt(nosey, windVelocity(speed, 0), [0, 0, q]).moment[2] - base.moment[2]).toBeLessThan(0);
    expect(loadsAt(nosey, windVelocity(speed, 0), [0, 0, -q]).moment[2] - base.moment[2]).toBeGreaterThan(0);
    for (const [model, trim] of [[dartFixture(), DART_TRIM], [gliderFixture(), NEUTRAL_TRIM]] as const) {
      const plane = buildAirframe(model, trim);
      const v = windVelocity(speed, 6 * DEG);
      const steady = loadsAt(plane, v);
      expect(loadsAt(plane, v, [0, 0, q]).moment[2] - steady.moment[2]).toBeLessThan(0);
      expect(loadsAt(plane, v, [0, 0, -q]).moment[2] - steady.moment[2]).toBeGreaterThan(0);
    }
  });

  it('yaw rate is opposed', () => {
    for (const [model, trim] of [[dartFixture(), DART_TRIM], [gliderFixture(), NEUTRAL_TRIM]] as const) {
      const plane = buildAirframe(model, trim);
      const v = windVelocity(speed, 5 * DEG);
      const still = loadsAt(plane, v);
      expect(loadsAt(plane, v, [0, 2, 0]).moment[1] - still.moment[1]).toBeLessThan(0);
      expect(loadsAt(plane, v, [0, -2, 0]).moment[1] - still.moment[1]).toBeGreaterThan(0);
    }
  });

  it('roll and pitch rates are opposed on the folded fixtures too', () => {
    for (const [model, trim] of [[dartFixture({ dihedralDeg: 8 }), DART_TRIM], [gliderFixture(), NEUTRAL_TRIM]] as const) {
      const plane = buildAirframe(model, trim);
      const v = windVelocity(speed, 5 * DEG);
      const still = loadsAt(plane, v);
      expect(loadsAt(plane, v, [3, 0, 0]).moment[0] - still.moment[0]).toBeLessThan(0);
      expect(loadsAt(plane, v, [-3, 0, 0]).moment[0] - still.moment[0]).toBeGreaterThan(0);
    }
  });
});

describe('trailing-edge bends', () => {
  const model = a4AreaPlate(6);
  const speed = 6;

  it('up elevator pushes the tail down and the nose up; effectiveness follows eta_f tau(E)', () => {
    const clean = buildAirframe(model, NEUTRAL_TRIM);
    const surface = clean.surfaces[0];
    const kp = surface.kp;
    const eta = surface.flapEfficiency;
    const chord = clean.ref.mac;
    const delta = 2 * DEG;
    for (const e of [0.05, 0.1, 0.15, 0.2, 0.3]) {
      const built = buildAirframe(model, trimOf({ elevatorDeg: 2, elevatorChordFrac: e }));
      // Thin-airfoil limit (slenderness switched off): exactly the document's flap.
      const thin: Airframe = { ...built, surfaces: built.surfaces.map((s) => ({ ...s, flapSlenderness: 0 })) };
      for (const af of [thin, built]) {
        const out = loadsAt(af, windVelocity(speed, 0));
        const cl = out.force[1] / qS(af, speed);
        expect(cl).toBeLessThan(0); // trailing edge up: download
        const tau = -cl / kp / delta / eta; // d(alpha_eff)/d(delta) / eta_f
        // Moment about the quarter chord, nose up.
        const cm = (out.moment[2] - 0.25 * chord * out.force[1]) / (qS(af, speed) * chord);
        expect(cm).toBeGreaterThan(0);
        const documented = (-flapCmDelta(e) * delta * eta * kp) / (2 * Math.PI);
        if (af === thin) {
          expect(tau / flapTau(e)).toBeCloseTo(1, 3);
          // 1 % or so off: the strip's centre of pressure sits a hair behind the quarter chord at this incidence.
          expect(cm / documented).toBeCloseTo(1, 1);
        } else {
          // At aspect ratio 6 the slender-wing share is 1 / 37: still within 10 % of the tau table.
          expect(surface.flapSlenderness).toBeCloseTo(1 / 37, 12);
          expect(tau / flapTau(e)).toBeGreaterThan(1);
          expect(tau / flapTau(e)).toBeLessThan(1.1);
          expect(cm / documented).toBeGreaterThan(1);
          expect(cm / documented).toBeLessThan(1.25);
          const terms = bendTerms(e, delta, surface);
          expect(-cl / kp).toBeCloseTo(terms.shift, 5);
        }
      }
    }
  });

  it('bend model has the thin-airfoil and the slender-wing limits', () => {
    const base = { kp: 2, k0: 0.25, flapEfficiency: 0.8 };
    const delta = 0.1;
    const thin = bendTerms(0.2, delta, { ...base, flapSlenderness: 0 });
    expect(thin.shift).toBeCloseTo(0.8 * flapTau(0.2) * delta, 15);
    expect(thin.moment).toBeCloseTo((-flapCmDelta(0.2) * delta * 0.8 * 2) / (2 * Math.PI), 15);
    // Slender: the whole bend angle counts and its load sits at the hinge line, 1 - E - k0 behind the CP.
    const slender = bendTerms(0.2, delta, { ...base, flapSlenderness: 1 });
    expect(slender.shift).toBeCloseTo(0.8 * delta, 15);
    expect(slender.moment).toBeCloseTo(2 * 0.8 * delta * (0.8 - 0.25), 15);
    const mid = bendTerms(0.2, delta, { ...base, flapSlenderness: 0.5 });
    expect(mid.shift).toBeGreaterThan(thin.shift);
    expect(mid.shift).toBeLessThan(slender.shift);
    expect(bendTerms(0, delta, { ...base, flapSlenderness: 0.5 })).toEqual({ shift: 0, moment: 0 });
  });

  it('aileron rolls to the right, rudder yaws the nose to the right', () => {
    const roll = loadsAt(buildAirframe(model, trimOf({ aileronDeg: 3 })), windVelocity(speed, 3 * DEG));
    expect(roll.moment[0]).toBeGreaterThan(0); // positive about +x: right wing down
    const dart = dartFixture({ keelSpreadDeg: 30 });
    const yaw = loadsAt(buildAirframe(dart, trimOf({ rudderDeg: 5 })), windVelocity(speed, 3 * DEG));
    const none = loadsAt(buildAirframe(dart, NEUTRAL_TRIM), windVelocity(speed, 3 * DEG));
    expect(yaw.moment[1] - none.moment[1]).toBeLessThan(0); // negative about +y: nose right
    expect(yaw.force[2] - none.force[2]).toBeLessThan(0); // tail pushed to the left
  });

  it('bend terms fade with the stall and vanish in reversed flow', () => {
    const bent = buildAirframe(model, trimOf({ elevatorDeg: 5 }));
    const clean = buildAirframe(model, NEUTRAL_TRIM);
    const forward = Math.abs(loadsAt(bent, windVelocity(speed, 0)).force[1]);
    expect(forward).toBeGreaterThan(1e-4);
    const reversed = loadsAt(bent, windVelocity(speed, Math.PI));
    expect(Math.abs(reversed.force[1])).toBeLessThan(1e-12);
    expect(Math.abs(reversed.moment[2])).toBeLessThan(1e-12);
    // Fully separated: the bend moment is gone; only the shifted incidence remains in the plate curve.
    // Wind on the underside is a negative incidence in the element's terms; an up-bend reduces its size.
    const a = 60 * DEG;
    const shift = bendTerms(0.2, 5 * DEG, clean.surfaces[0]).shift;
    const eff = a - shift;
    const expected = (clean.surfaces[0].cd90 * Math.sin(eff)) / (0.56 + 0.44 * Math.sin(eff));
    expect(loadsAt(bent, windVelocity(speed, a)).force[1] / qS(bent, speed)).toBeCloseTo(expected, 9);
  });
});

describe('sideslip loading of slender wings (roll due to sideslip without dihedral)', () => {
  const rollCoefficient = (af: Airframe, alpha: number, beta: number): number =>
    loadsAt(af, windVelocity(5, alpha, beta)).moment[0] / (qS(af, 5) * af.ref.span);

  it('a flat delta gets the slender-wing value Cl = -(pi / 3) sin a sin b, whatever its aspect ratio', () => {
    for (const model of [a4AreaDelta(0.5), a4AreaDelta(1), a4AreaDelta(2), flatDeltaModel(0.05, 0.3)]) {
      const af = buildAirframe(model, NEUTRAL_TRIM);
      const s = af.surfaces[0];
      expect(s.deltaness).toBeCloseTo(1, 6);
      expect(slipLoadingWeight(s)).toBeCloseTo(1, 6);
      for (const [a, b] of [[5, 5], [10, 5], [5, -5], [8, 3]]) {
        const theory = -(Math.PI / 3) * Math.sin(a * DEG) * Math.sin(b * DEG);
        expect(rollCoefficient(af, a * DEG, b * DEG) / theory).toBeCloseTo(1, 2);
      }
      // As a stability derivative: Cl_beta = -(pi / 3) alpha per radian of sideslip.
      const clBeta = (rollCoefficient(af, 8 * DEG, 1 * DEG) - rollCoefficient(af, 8 * DEG, -1 * DEG)) / (2 * DEG);
      expect(clBeta / (-(Math.PI / 3) * 8 * DEG)).toBeCloseTo(1, 1);
    }
  });

  it('the weight follows the sweep: none on a straight leading edge, all of it on a delta', () => {
    expect(slipLoadingWeight({ deltaness: 0 })).toBe(0);
    expect(slipLoadingWeight({ deltaness: 0.4 })).toBeCloseTo(0.4, 12);
    expect(slipLoadingWeight({ deltaness: 1 })).toBe(1);
    expect(slipLoadingWeight({ deltaness: 1.7 })).toBe(1);
    expect(slipLoadingWeight({ deltaness: -0.2 })).toBe(0);
  });

  it('wind from the right raises the right wing; no slip or no lift, no roll; the lift itself is unchanged', () => {
    const af = buildAirframe(a4AreaDelta(1), NEUTRAL_TRIM);
    expect(loadsAt(af, windVelocity(5, 8 * DEG, 5 * DEG)).moment[0]).toBeLessThan(0);
    expect(loadsAt(af, windVelocity(5, 8 * DEG, -5 * DEG)).moment[0]).toBeGreaterThan(0);
    // Upside down the windward wing is pushed down harder: the roll changes sign with the lift.
    expect(loadsAt(af, windVelocity(5, -8 * DEG, 5 * DEG)).moment[0]).toBeGreaterThan(0);
    expect(Math.abs(rollCoefficient(af, 0, 5 * DEG))).toBeLessThan(1e-12);
    expect(Math.abs(rollCoefficient(af, 8 * DEG, 0))).toBeLessThan(1e-12);
    // An antisymmetric load: the normal force is that of the same wing at the same incidence without slip.
    const slipping = loadsAt(af, windVelocity(5, 8 * DEG, 5 * DEG)).force[1];
    const speed = 5 * Math.hypot(Math.cos(8 * DEG) * Math.cos(5 * DEG), Math.sin(8 * DEG) * Math.cos(5 * DEG), Math.sin(5 * DEG));
    const incidence = Math.asin((5 * Math.sin(8 * DEG) * Math.cos(5 * DEG)) / speed);
    const straight = loadsAt(af, windVelocity(speed, incidence, 0)).force[1];
    expect(slipping / straight).toBeCloseTo(1, 6);
  });

  it('unswept wings are left alone, and a slip never pushes a strip below zero load', () => {
    for (const model of [a4AreaPlate(1), a4AreaPlate(3), flatPlateModel(0.6, 0.1)]) {
      const af = buildAirframe(model, NEUTRAL_TRIM);
      expect(slipLoadingWeight(af.surfaces[0])).toBe(0);
      expect(Math.abs(rollCoefficient(af, 8 * DEG, 10 * DEG))).toBeLessThan(1e-12);
    }
    const delta = buildAirframe(a4AreaDelta(1), NEUTRAL_TRIM);
    for (const [a, b] of [[10, 30], [5, 60], [20, 45], [30, -40]]) {
      const detail = aeroLoadsDetailed(delta, windVelocity(5, a * DEG, b * DEG), STILL, AIR);
      for (const e of detail.elements) expect(e.normalForce[1]).toBeGreaterThanOrEqual(-1e-12);
    }
    // Past the stall the wing is a bluff plate and the term is gone.
    expect(Math.abs(rollCoefficient(delta, 80 * DEG, 10 * DEG))).toBeLessThan(1e-9);
  });

  it('gives the flat-winged fixture dart the dihedral effect strip theory lacks', () => {
    const af = buildAirframe(dartFixture(), DART_TRIM);
    // The keel alone rolls the plane INTO the slip (it hangs below the roll axis); the wing now outweighs it.
    expect(loadsAt(af, windVelocity(5, 8 * DEG, 5 * DEG)).moment[0]).toBeLessThan(0);
    expect(loadsAt(af, windVelocity(5, 8 * DEG, -5 * DEG)).moment[0]).toBeGreaterThan(0);
  });
});

describe('fuselage walls', () => {
  it('pressed together they act as one plate: half the normal force and one wetted face each', () => {
    const speed = 5;
    const closed = buildAirframe(dartFixture(), NEUTRAL_TRIM);
    const beta = 4 * DEG;
    const detail = aeroLoadsDetailed(closed, windVelocity(speed, 0, beta), STILL, AIR);
    const walls = detail.elements.filter((e) => closed.elements[e.index].role === 'fuselage');
    expect(walls).toHaveLength(6);
    let side = 0;
    for (const w of walls) {
      const el = closed.elements[w.index];
      const s = closed.surfaces[el.surface];
      const cn = s.kp * Math.sin(beta) * Math.cos(beta) + s.kv * Math.sin(beta) ** 2;
      expect(w.cn).toBeCloseTo(cn, 9);
      // Wind from the right pushes the keel to the left.
      expect(w.normalForce[2]).toBeCloseTo(-0.5 * w.dynamicPressure * el.area * cn, 12);
      const cf = friction(w.reynolds);
      expect(Math.hypot(...w.friction)).toBeCloseTo(0.5 * w.dynamicPressure * el.area * cf * Math.cos(beta), 12);
      side += w.normalForce[2];
    }
    expect(side).toBeLessThan(0);
    // At zero sideslip a closed vertical keel carries friction only.
    const straight = aeroLoadsDetailed(closed, windVelocity(speed, 5 * DEG), STILL, AIR);
    for (const e of straight.elements) {
      if (closed.elements[e.index].role === 'fuselage') expect(Math.hypot(...e.normalForce)).toBeLessThan(1e-15);
    }
  });
});

describe('aeroLoads as a function', () => {
  const af = buildAirframe(dartFixture({ dihedralDeg: 8 }), DART_TRIM);

  it('the detailed variant is the same physics', () => {
    const v: Vec3 = [4.4, -0.6, 0.3];
    const w: Vec3 = [0.8, -0.3, 1.2];
    const fast = loadsAt(af, v, w);
    const detail = aeroLoadsDetailed(af, v, w, AIR);
    expect(detail.elements).toHaveLength(af.elements.length);
    const sum = [0, 0, 0, 0, 0, 0];
    for (const e of detail.elements) {
      for (let k = 0; k < 3; k++) {
        sum[k] += e.force[k];
        sum[3 + k] += e.moment[k];
        expect(e.force[k]).toBeCloseTo(e.normalForce[k] + e.friction[k], 15);
      }
      // The pressure force is along the element normal, friction lies in the element plane.
      const n = af.elements[e.index].normal;
      expect(e.friction[0] * n[0] + e.friction[1] * n[1] + e.friction[2] * n[2]).toBeCloseTo(0, 15);
    }
    for (let k = 0; k < 3; k++) {
      expect(detail.force[k]).toBe(fast.force[k]);
      expect(detail.moment[k]).toBe(fast.moment[k]);
      expect(sum[k]).toBeCloseTo(fast.force[k], 14);
      expect(sum[3 + k]).toBeCloseTo(fast.moment[k], 14);
    }
  });

  it('is deterministic and keeps separate airframes apart', () => {
    const v: Vec3 = [4.4, -0.6, 0.3];
    const w: Vec3 = [0.8, -0.3, 1.2];
    const a = loadsAt(af, v, w);
    const other = buildAirframe(dartFixture({ dihedralDeg: 8 }), trimOf({ elevatorDeg: 9 }));
    const b = loadsAt(other, v, w);
    const again = loadsAt(af, v, w);
    expect(again).toEqual(a);
    expect(b.moment[2]).not.toBe(a.moment[2]);
    // Left-right mirror image of the motion gives the mirror image of the loads.
    const m = loadsAt(af, [v[0], v[1], -v[2]], [-w[0], -w[1], w[2]]);
    expect(m.force[0]).toBeCloseTo(a.force[0], 12);
    expect(m.force[1]).toBeCloseTo(a.force[1], 12);
    expect(m.force[2]).toBeCloseTo(-a.force[2], 12);
    expect(m.moment[0]).toBeCloseTo(-a.moment[0], 12);
    expect(m.moment[1]).toBeCloseTo(-a.moment[1], 12);
    expect(m.moment[2]).toBeCloseTo(a.moment[2], 12);
  });

  it('runs 100 000 evaluations in under 150 ms without allocating', () => {
    const out = createAeroLoads();
    const v: [number, number, number] = [4.4, -0.6, 0.3];
    const w: [number, number, number] = [0.8, -0.3, 1.2];
    const run = (): number => {
      const start = performance.now();
      let check = 0;
      for (let i = 0; i < 100_000; i++) {
        v[1] = -0.6 + (i & 15) * 0.01;
        w[2] = 1.2 - (i & 7) * 0.1;
        aeroLoads(af, v, w, AIR, out);
        check += out.force[1];
      }
      expect(Number.isFinite(check)).toBe(true);
      return performance.now() - start;
    };
    // Best of a few runs: the first one includes JIT warm-up, and a shared CI core can be preempted.
    let best = Infinity;
    for (let rep = 0; rep < 5; rep++) best = Math.min(best, run());
    expect(best).toBeLessThan(150);
    // The output object is reused, never replaced.
    const force = out.force;
    const moment = out.moment;
    aeroLoads(af, v, w, AIR, out);
    expect(out.force).toBe(force);
    expect(out.moment).toBe(moment);
  });
});
