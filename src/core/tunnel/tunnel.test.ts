import { describe, expect, it } from 'vitest';
import { STANDARD_GRAVITY, buildAirframe } from '../airframe';
import { DEG } from '../math';
import {
  a4AreaPlate, dartFixture, DART_TRIM, dihedralPlateModel, finnedPlateModel, flatDeltaModel, flatPlateModel,
  flyableDart, flyableGlider, GLIDER_TRIM, gliderFixture, NEUTRAL_TRIM, TEST_AIR, trimOf,
} from '../testing/fixtures';
import type { Airframe, PolarPoint } from '../types';
import { analyzeTrim, computePolar, tunnelReading } from './tunnel';

const AIR = TEST_AIR;
const NU = AIR.mu / AIR.rho;

/** Key numbers of a fine polar, as tabulated in doc 01 section 10.4. */
function polarSummary(af: Airframe, speed: number) {
  const polar = computePolar(af, AIR, { speed, fromDeg: 0, toDeg: 90, stepDeg: 0.1 });
  const at = (deg: number): PolarPoint => polar[Math.round(deg * 10)];
  let best = polar[0];
  for (const p of polar) if (p.ld > best.ld) best = p;
  let top = polar[0];
  for (let i = 1; i + 1 < polar.length; i++) {
    if (polar[i].cl > polar[i - 1].cl && polar[i].cl >= polar[i + 1].cl) {
      top = polar[i];
      break;
    }
  }
  return {
    cd0: at(0).cd,
    slope: (at(2).cl - at(0).cl) / (2 * DEG),
    best,
    top,
    cl45: at(45).cl,
    cn90: at(90).cd,
    polar,
  };
}

const within = (value: number, expected: number, fraction: number): void => {
  expect(Math.abs(value - expected)).toBeLessThanOrEqual(fraction * Math.abs(expected));
};

describe('single-surface polars reproduce doc 01 section 10.4', () => {
  it('rectangular plate, aspect ratio 1, Re 8e4', () => {
    const af = buildAirframe(a4AreaPlate(1), NEUTRAL_TRIM);
    const s = polarSummary(af, (8e4 * NU) / af.ref.mac);
    within(s.cd0, 0.0154, 0.01);
    within(s.slope, 1.55, 0.03);
    within(s.best.ld, 5.2, 0.03);
    expect(s.best.alphaDeg).toBeCloseTo(5.8, 0);
    within(s.best.cl, 0.17, 0.05);
    within(s.top.cl, 1.19, 0.03);
    expect(Math.abs(s.top.alphaDeg - 35.7)).toBeLessThan(0.5);
    within(s.cl45, 0.66, 0.03);
    within(s.cn90, 1.17, 0.01);
  });

  it('rectangular plate, aspect ratio 3, Re 8e4', () => {
    const af = buildAirframe(a4AreaPlate(3), NEUTRAL_TRIM);
    const s = polarSummary(af, (8e4 * NU) / af.ref.mac);
    within(s.cd0, 0.0154, 0.01);
    within(s.slope, 3.34, 0.03);
    within(s.best.ld, 7.35, 0.03);
    expect(Math.abs(s.best.alphaDeg - 3.9)).toBeLessThan(0.5);
    within(s.best.cl, 0.23, 0.05);
    within(s.top.cl, 0.7, 0.03);
    expect(Math.abs(s.top.alphaDeg - 13)).toBeLessThan(0.5);
    within(s.cn90, 1.17, 0.01);
  });

  it('delta, aspect ratio 1, at the tabulated CD0 of 0.0212', () => {
    const af = buildAirframe(flatDeltaModel(0.14, 0.28), NEUTRAL_TRIM);
    // The table's CD0 includes keel friction; pick the airspeed that gives the bare delta the same CD0.
    let lo = 0.5;
    let hi = 20;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (tunnelReading(af, { speed: mid, alphaDeg: 0, betaDeg: 0 }, AIR).cd > 0.0212) lo = mid;
      else hi = mid;
    }
    const s = polarSummary(af, lo);
    within(s.cd0, 0.0212, 0.001);
    within(s.slope, 1.34, 0.03);
    within(s.best.ld, 4.3, 0.03);
    expect(Math.abs(s.best.alphaDeg - 7.2)).toBeLessThan(0.5);
    within(s.best.cl, 0.2, 0.05);
    within(s.top.cl, 1.36, 0.03);
    expect(Math.abs(s.top.alphaDeg - 37.7)).toBeLessThan(0.5);
    // No sharp stall (doc 02 V4): still 1.10 at 45 degrees.
    within(s.cl45, 1.1, 0.03);
    within(s.cn90, 1.17, 0.01);
  });

  it('no leading-edge suction: CD = CD0 + CL tan(alpha)', () => {
    for (const ar of [1, 3, 6]) {
      const af = buildAirframe(a4AreaPlate(ar), NEUTRAL_TRIM);
      const speed = 5;
      const cd0 = tunnelReading(af, { speed, alphaDeg: 0, betaDeg: 0 }, AIR).cd;
      const stall = af.surfaces[0].alphaStall / DEG;
      for (const p of computePolar(af, AIR, { speed, fromDeg: 0.5, toDeg: stall, stepDeg: 0.5 })) {
        expect(p.cd).toBeCloseTo(cd0 + p.cl * Math.tan(p.alphaDeg * DEG), 9);
        expect(p.ld).toBeCloseTo(p.cl / p.cd, 12);
      }
    }
  });

  it('flat plate symmetry: CL(-a) = -CL(a), reversed flow is a plate too, no side force at zero sideslip', () => {
    const af = buildAirframe(a4AreaPlate(3), NEUTRAL_TRIM);
    const speed = 5;
    for (const a of [3, 10, 25, 70]) {
      const up = tunnelReading(af, { speed, alphaDeg: a, betaDeg: 0 }, AIR);
      const down = tunnelReading(af, { speed, alphaDeg: -a, betaDeg: 0 }, AIR);
      expect(down.cl).toBeCloseTo(-up.cl, 12);
      expect(down.cd).toBeCloseTo(up.cd, 12);
      expect(down.cm).toBeCloseTo(-up.cm, 12);
      expect(Math.abs(up.side)).toBeLessThan(1e-15);
      // Trailing edge first, same incidence: same drag, lift of the same size on the other side of the wind.
      const back = tunnelReading(af, { speed, alphaDeg: 180 - a, betaDeg: 0 }, AIR);
      expect(back.cd).toBeCloseTo(up.cd, 10);
      expect(back.cl).toBeCloseTo(-up.cl, 10);
      // Centre of pressure measured from the upstream edge: mirrored about mid-chord.
      expect(back.cpX! + up.cpX!).toBeCloseTo(af.ref.mac, 10);
    }
    const dart = buildAirframe(dartFixture({ dihedralDeg: 10, keelSpreadDeg: 25 }), DART_TRIM);
    for (const a of [-5, 0, 8, 30]) {
      const r = tunnelReading(dart, { speed, alphaDeg: a, betaDeg: 0 }, AIR);
      expect(Math.abs(r.side)).toBeLessThan(1e-12);
      expect(Math.abs(r.moment[0])).toBeLessThan(1e-13);
      expect(Math.abs(r.moment[1])).toBeLessThan(1e-13);
    }
  });
});

describe('tunnelReading', () => {
  it('resolves forces in wind axes and reports coefficients on the reference area', () => {
    const af = buildAirframe(flatPlateModel(0.3, 0.1), NEUTRAL_TRIM);
    const speed = 6;
    const a = 8 * DEG;
    const r = tunnelReading(af, { speed, alphaDeg: 8, betaDeg: 0 }, AIR);
    const q = 0.5 * AIR.rho * speed * speed * 0.03;
    const s = af.surfaces[0];
    const cn = s.kp * Math.sin(a) * Math.cos(a) + s.kv * Math.sin(a) ** 2;
    const ca = (2.656 / Math.sqrt((speed * 0.1) / NU) + 0.006) * Math.cos(a);
    expect(r.lift / q).toBeCloseTo(cn * Math.cos(a) - ca * Math.sin(a), 10);
    expect(r.drag / q).toBeCloseTo(cn * Math.sin(a) + ca * Math.cos(a), 10);
    expect(r.cl).toBeCloseTo(r.lift / q, 12);
    expect(r.cd).toBeCloseTo(r.drag / q, 12);
    expect(r.cm).toBeCloseTo(r.moment[2] / (q * 0.1), 12);
    expect(r.reynolds).toBeCloseTo((speed * 0.1) / NU, 6);
    expect(r.speed).toBe(speed);
    expect(r.alphaDeg).toBe(8);
    // Centre of pressure: quarter chord plus the travel with incidence, measured from the leading edge.
    expect(r.cpX).toBeCloseTo(0.1 * (1 - (0.25 + 0.25 * Math.sin(a))), 10);
    expect(tunnelReading(af, { speed, alphaDeg: 0, betaDeg: 0 }, AIR).cpX).toBeNull();
  });

  it('side force points away from the wind; lift, drag and side are orthogonal components', () => {
    const af = buildAirframe(dartFixture({ dihedralDeg: 8 }), DART_TRIM);
    const speed = 5;
    const right = tunnelReading(af, { speed, alphaDeg: 6, betaDeg: 5 }, AIR);
    const left = tunnelReading(af, { speed, alphaDeg: 6, betaDeg: -5 }, AIR);
    expect(right.side).toBeLessThan(0); // wind from the right pushes the plane to the left
    expect(left.side).toBeCloseTo(-right.side, 12);
    expect(left.lift).toBeCloseTo(right.lift, 12);
    expect(left.drag).toBeCloseTo(right.drag, 12);
    expect(left.moment[0]).toBeCloseTo(-right.moment[0], 12);
    expect(left.moment[1]).toBeCloseTo(-right.moment[1], 12);
    expect(left.moment[2]).toBeCloseTo(right.moment[2], 12);
    expect(right.drag).toBeGreaterThan(0);
  });

  it('computePolar sweeps -10 to 60 degrees in whole degrees by default', () => {
    const af = buildAirframe(gliderFixture(), GLIDER_TRIM);
    const polar = computePolar(af, AIR, { speed: 3 });
    expect(polar).toHaveLength(71);
    expect(polar[0].alphaDeg).toBe(-10);
    expect(polar[70].alphaDeg).toBe(60);
    const at6 = tunnelReading(af, { speed: 3, alphaDeg: 6, betaDeg: 0 }, AIR);
    expect(polar[16].cl).toBe(at6.cl);
    expect(polar[16].cm).toBe(at6.cm);
    expect(computePolar(af, AIR, { speed: 3, stepDeg: 0 })).toEqual([]);
  });
});

describe('elevator', () => {
  it('up elevator adds a nose-up moment and raises the trim angle of attack', () => {
    for (const model of [dartFixture(), gliderFixture()]) {
      const flat = buildAirframe(model, NEUTRAL_TRIM);
      const bent = buildAirframe(model, trimOf({ elevatorDeg: 2 }));
      for (const a of [0, 4, 8]) {
        const setting = { speed: 4, alphaDeg: a, betaDeg: 0 };
        expect(tunnelReading(bent, setting, AIR).cm).toBeGreaterThan(tunnelReading(flat, setting, AIR).cm);
        expect(tunnelReading(bent, setting, AIR).cl).toBeLessThan(tunnelReading(flat, setting, AIR).cl);
      }
    }
    const dart = dartFixture();
    const one = analyzeTrim(buildAirframe(dart, trimOf({ elevatorDeg: 1 })), AIR);
    const two = analyzeTrim(buildAirframe(dart, trimOf({ elevatorDeg: 2 })), AIR);
    expect(one.trimmable && two.trimmable).toBe(true);
    expect(two.alphaDeg!).toBeGreaterThan(one.alphaDeg! + 1);
    expect(two.speed!).toBeLessThan(one.speed!);
  });
});

describe('analyzeTrim', () => {
  it('fixture glider: trims without any bend and glides inside the evidence band', () => {
    const af = buildAirframe(gliderFixture(), GLIDER_TRIM);
    const t = analyzeTrim(af, AIR);
    expect(t.trimmable).toBe(true);
    expect(t.glideRatio!).toBeGreaterThan(5);
    expect(t.glideRatio!).toBeLessThan(8);
    expect(t.alphaDeg!).toBeGreaterThan(3);
    expect(t.alphaDeg!).toBeLessThan(t.stallAlphaDeg);
    expect(t.stallAlphaDeg).toBeGreaterThan(10);
    expect(t.stallAlphaDeg).toBeLessThan(15);
    expect(t.speed!).toBeGreaterThan(2);
    expect(t.speed!).toBeLessThan(4);
    expect(t.sinkRate!).toBeGreaterThan(0.25); // no single sheet sinks slower (doc 02 section 6.1)
    expect(t.sinkRate!).toBeLessThan(0.8);
    expect(t.pitchStable).toBe(true);
    expect(t.staticMarginPct).toBeGreaterThan(0);
    expect(t.bestLd).toBeGreaterThanOrEqual(t.glideRatio! - 1e-6);
  });

  it('fixture dart: trims with a degree of up elevator and glides near the evidence band', () => {
    const af = buildAirframe(dartFixture(), DART_TRIM);
    const t = analyzeTrim(af, AIR);
    expect(t.trimmable).toBe(true);
    // Evidence: L/D 4-6, V about 4.9 m/s, CL about 0.17 (doc 01 section 10.4, tolerance about 15 %).
    expect(t.glideRatio!).toBeGreaterThan(3.6);
    expect(t.glideRatio!).toBeLessThan(6);
    expect(t.speed!).toBeGreaterThan(3.5);
    expect(t.speed!).toBeLessThan(6);
    within(t.speed!, 4.9, 0.15);
    within(t.cl!, 0.17, 0.25);
    expect(t.pitchStable).toBe(true);
    expect(t.staticMarginPct).toBeGreaterThan(2);
    expect(t.staticMarginPct).toBeLessThan(10);
    // Gentle stall of a slender delta (doc 02 V4).
    expect(t.stallAlphaDeg).toBeGreaterThan(33);
    expect(t.stallAlphaDeg).toBeLessThan(45);
    // Without the bend it only dives.
    const bare = analyzeTrim(buildAirframe(dartFixture(), NEUTRAL_TRIM), AIR);
    expect(bare.trimmable ? bare.glideRatio! : 0).toBeLessThan(2);
  });

  it('equilibrium glide satisfies L = W cos(gamma), D = W sin(gamma)', () => {
    for (const [model, trim] of [[dartFixture(), DART_TRIM], [gliderFixture(), GLIDER_TRIM]] as const) {
      const af = buildAirframe(model, trim);
      const t = analyzeTrim(af, AIR);
      const r = tunnelReading(af, { speed: t.speed!, alphaDeg: t.alphaDeg!, betaDeg: 0 }, AIR);
      const weight = af.mass * STANDARD_GRAVITY;
      const gamma = Math.atan2(r.drag, r.lift);
      expect(r.lift).toBeCloseTo(weight * Math.cos(gamma), 8);
      expect(r.drag).toBeCloseTo(weight * Math.sin(gamma), 8);
      expect(Math.abs(r.cm)).toBeLessThan(1e-9);
      expect(t.cl!).toBeCloseTo(r.cl, 9);
      expect(t.glideRatio!).toBeCloseTo(r.cl / r.cd, 9);
      expect(t.sinkRate!).toBeCloseTo(t.speed! * Math.sin(gamma), 9);
      // Stable: the pitching moment falls through zero.
      const above = tunnelReading(af, { speed: t.speed!, alphaDeg: t.alphaDeg! + 0.5, betaDeg: 0 }, AIR);
      const below = tunnelReading(af, { speed: t.speed!, alphaDeg: t.alphaDeg! - 0.5, betaDeg: 0 }, AIR);
      expect(above.cm).toBeLessThan(0);
      expect(below.cm).toBeGreaterThan(0);
    }
  });

  it('the flyable fixture variants trim, glide in their bands and are laterally sound', () => {
    const dart = analyzeTrim(buildAirframe(flyableDart(), DART_TRIM), AIR);
    expect(dart.trimmable).toBe(true);
    expect(dart.glideRatio!).toBeGreaterThan(3.6);
    expect(dart.speed!).toBeGreaterThan(3.5);
    expect(dart.speed!).toBeLessThan(6);
    expect(dart.rollStable).toBe(true);
    expect(dart.cnBetaDynamic).toBeGreaterThan(0);
    const glider = analyzeTrim(buildAirframe(flyableGlider(), GLIDER_TRIM), AIR);
    expect(glider.trimmable).toBe(true);
    expect(glider.glideRatio!).toBeGreaterThan(5);
    expect(glider.glideRatio!).toBeLessThan(8);
    expect(glider.rollStable).toBe(true);
    expect(glider.yawStable).toBe(true);
    expect(glider.cnBetaDynamic).toBeGreaterThan(0);
  });

  it('survives a model with no paper', () => {
    const empty = buildAirframe({ ...flatPlateModel(0.2, 0.1), pieces: [], panels: [] }, NEUTRAL_TRIM);
    expect(empty.mass).toBe(0);
    expect(empty.elements).toHaveLength(0);
    const t = analyzeTrim(empty, AIR);
    expect(t.trimmable).toBe(false);
    for (const v of Object.values(t)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    const r = tunnelReading(empty, { speed: 5, alphaDeg: 5, betaDeg: 0 }, AIR);
    expect(r.lift).toBe(0);
    expect(r.cl).toBe(0);
    expect(r.cpX).toBeNull();
  });

  it('is deterministic', () => {
    const af = buildAirframe(dartFixture({ dihedralDeg: 8 }), DART_TRIM);
    expect(analyzeTrim(af, AIR)).toEqual(analyzeTrim(af, AIR));
  });

  it('without a stable trim it still reports the neutral point, the margin and the sweep results', () => {
    // A bare plate with its CG at mid-chord: the centre of pressure is ahead of it at every angle below 90.
    const af = buildAirframe(a4AreaPlate(3), NEUTRAL_TRIM);
    const t = analyzeTrim(af, AIR);
    expect(t.trimmable).toBe(false);
    expect(t.alphaDeg).toBeNull();
    expect(t.cl).toBeNull();
    expect(t.speed).toBeNull();
    expect(t.glideRatio).toBeNull();
    expect(t.sinkRate).toBeNull();
    expect(t.pitchStable).toBe(false);
    expect(t.staticMarginPct).toBeLessThan(-15);
    expect(t.bestLd).toBeGreaterThan(5);
    expect(Math.abs(t.stallAlphaDeg - 13)).toBeLessThan(0.5);
    expect(t.bestLdAlphaDeg).toBeGreaterThan(3);
    expect(t.bestLdAlphaDeg).toBeLessThan(7);
    // Neutral point of the model at that incidence: xp + CN xp' / CN' behind the leading edge.
    const a = t.bestLdAlphaDeg * DEG;
    const np = 0.25 + 0.25 * Math.sin(a) + (0.25 * Math.sin(a) * Math.cos(a) ** 2) / Math.cos(2 * a);
    expect(t.neutralPointX / af.ref.mac).toBeCloseTo(1 - np, 2);
    // Too much up elevator: the nose keeps rising into the stall.
    const over = analyzeTrim(buildAirframe(gliderFixture(), trimOf({ elevatorDeg: 12 })), AIR);
    expect(over.trimmable).toBe(false);
    expect(Number.isFinite(over.neutralPointX)).toBe(true);
  });

  it('flat delta: neutral point at two thirds of the root chord (slender-wing value, doc 01 section 6)', () => {
    const rootChord = 0.28;
    const t = analyzeTrim(buildAirframe(flatDeltaModel(0.14, rootChord), NEUTRAL_TRIM), AIR);
    // Measured from the tail: one third of the root chord.
    expect(t.neutralPointX / rootChord).toBeCloseTo(1 / 3, 2);
  });
});

describe('static margin consistency (doc 02 V6)', () => {
  it('moving the CG 5 % MAC aft lowers the margin by 5 points and leaves the neutral point alone', () => {
    for (const model of [dartFixture(), gliderFixture()]) {
      const bare = buildAirframe(model, NEUTRAL_TRIM);
      // A heavy ballast at the nose, so that both CG positions are too far forward to trim without a bend.
      const clipMass = 0.008;
      const shift = (0.05 * bare.ref.mac * (bare.mass + clipMass)) / clipMass;
      const front = bare.ref.length - 0.005;
      const fore = buildAirframe(model, trimOf({ clip: { mass: clipMass, x: front } }));
      const aft = buildAirframe(model, trimOf({ clip: { mass: clipMass, x: front - shift } }));
      expect(fore.cg[0] - aft.cg[0]).toBeCloseTo(0.05 * bare.ref.mac, 12);
      const a = analyzeTrim(fore, AIR);
      const b = analyzeTrim(aft, AIR);
      // Nose-heavy and unbent: neither trims, so both are measured at the same best-glide incidence.
      expect(a.trimmable || b.trimmable).toBe(false);
      expect(a.staticMarginPct - b.staticMarginPct).toBeGreaterThan(4.5);
      expect(a.staticMarginPct - b.staticMarginPct).toBeLessThan(5.5);
      expect(Math.abs(a.neutralPointX - b.neutralPointX)).toBeLessThan(0.01 * bare.ref.mac);
      expect(a.staticMarginPct).toBeGreaterThan(b.staticMarginPct);
      expect(b.pitchStable).toBe(true);
    }
  });

  it('holds for a trimmed plane re-trimmed to the same angle of attack', () => {
    const model = dartFixture();
    const clipMass = 0.0006;
    const bare = buildAirframe(model, NEUTRAL_TRIM);
    const shift = (0.05 * bare.ref.mac * (bare.mass + clipMass)) / clipMass;
    const front = bare.ref.length - 0.005;
    const target = 7;
    // Elevator that trims at the target angle, by bisection (more elevator, higher trim angle).
    const retrim = (clipX: number) => {
      let lo = 0;
      let hi = 20;
      for (let i = 0; i < 50; i++) {
        const mid = 0.5 * (lo + hi);
        const t = analyzeTrim(
          buildAirframe(model, trimOf({ elevatorDeg: mid, elevatorChordFrac: 0.1, clip: { mass: clipMass, x: clipX } })),
          AIR,
        );
        if (t.trimmable && t.alphaDeg! >= target) hi = mid;
        else if (!t.trimmable && mid > 10) hi = mid;
        else lo = mid;
      }
      const elevatorDeg = 0.5 * (lo + hi);
      const af = buildAirframe(model, trimOf({ elevatorDeg, elevatorChordFrac: 0.1, clip: { mass: clipMass, x: clipX } }));
      return { elevatorDeg, t: analyzeTrim(af, AIR) };
    };
    const fore = retrim(front);
    const aft = retrim(front - shift);
    expect(fore.t.alphaDeg!).toBeCloseTo(target, 3);
    expect(aft.t.alphaDeg!).toBeCloseTo(target, 3);
    // The nose-heavy one needs more up elevator.
    expect(fore.elevatorDeg).toBeGreaterThan(aft.elevatorDeg);
    expect(fore.t.staticMarginPct - aft.t.staticMarginPct).toBeGreaterThan(4.5);
    expect(fore.t.staticMarginPct - aft.t.staticMarginPct).toBeLessThan(5.5);
    expect(Math.abs(fore.t.neutralPointX - aft.t.neutralPointX)).toBeLessThan(0.01 * bare.ref.mac);
  });
});

describe('lateral stability signs in this body frame (+x nose, +y up, +z right)', () => {
  it('dihedral gives a negative clBeta (windward wing rises): rollStable', () => {
    const vee = analyzeTrim(buildAirframe(dihedralPlateModel(0.6, 0.1, 10), NEUTRAL_TRIM), AIR);
    expect(vee.clBeta).toBeLessThan(0);
    expect(vee.rollStable).toBe(true);
    // Strip theory for a rectangular wing: Cl_beta = -CL_alpha sin(dihedral) / 4 (doc 02 section 4).
    const kp = buildAirframe(dihedralPlateModel(0.6, 0.1, 10), NEUTRAL_TRIM).surfaces[0].kp;
    within(vee.clBeta, (-kp * Math.sin(10 * DEG)) / 4, 0.1);
    const anhedral = analyzeTrim(buildAirframe(dihedralPlateModel(0.6, 0.1, -10), NEUTRAL_TRIM), AIR);
    expect(anhedral.clBeta).toBeGreaterThan(0);
    expect(anhedral.rollStable).toBe(false);
    const flat = analyzeTrim(buildAirframe(dihedralPlateModel(0.6, 0.1, 0), NEUTRAL_TRIM), AIR);
    expect(Math.abs(flat.clBeta)).toBeLessThan(1e-6);
    expect(flat.rollStable).toBe(false);
  });

  it('wind from the right raises the right wing of a dihedral wing and yaws a tail fin into the wind', () => {
    const vee = buildAirframe(dihedralPlateModel(0.6, 0.1, 10), NEUTRAL_TRIM);
    const r = tunnelReading(vee, { speed: 5, alphaDeg: 4, betaDeg: 5 }, AIR);
    expect(r.moment[0]).toBeLessThan(0); // negative about +x: right wing up
    const finned = buildAirframe(finnedPlateModel(0.3, 0.1, 0.03, 0, 0.03), NEUTRAL_TRIM);
    const y = tunnelReading(finned, { speed: 5, alphaDeg: 4, betaDeg: 5 }, AIR);
    expect(y.moment[1]).toBeLessThan(0); // negative about +y: nose to the right, into the wind
    expect(y.side).toBeLessThan(0);
  });

  it('a fin behind the CG gives a negative cnBeta: yawStable; a fin ahead of it does the opposite', () => {
    const behind = buildAirframe(finnedPlateModel(0.3, 0.1, 0.03, 0, 0.03), NEUTRAL_TRIM);
    const tail = analyzeTrim(behind, AIR);
    expect(behind.cg[0]).toBeGreaterThan(0.03);
    expect(tail.cnBeta).toBeLessThan(0);
    expect(tail.yawStable).toBe(true);
    const ahead = analyzeTrim(buildAirframe(finnedPlateModel(0.3, 0.1, 0.03, 0.07, 0.1), NEUTRAL_TRIM), AIR);
    expect(ahead.cnBeta).toBeGreaterThan(0);
    expect(ahead.yawStable).toBe(false);
    // A keel fin hangs below the roll axis: it rolls the plane into the slip (doc 02 section 4).
    expect(tail.clBeta).toBeGreaterThan(0);
    expect(tail.rollStable).toBe(false);
  });

  it('fixture dart with dihedral: roll stable, held on heading by the dihedral effect', () => {
    const t = analyzeTrim(buildAirframe(dartFixture({ dihedralDeg: 10 }), DART_TRIM), AIR);
    expect(t.rollStable).toBe(true);
    // The long keel carries its side force ahead of the CG: not weathercock stable on its own ...
    expect(t.yawStable).toBe(false);
    // ... but the dihedral effect of a slender plane (yaw inertia >> roll inertia) more than makes up for it.
    expect(t.cnBetaDynamic).toBeGreaterThan(0);
    const flat = analyzeTrim(buildAirframe(dartFixture(), DART_TRIM), AIR);
    expect(flat.cnBetaDynamic).toBeLessThan(0);
  });
});
