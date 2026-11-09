import { describe, expect, it } from 'vitest';
import { DEG, mat3Det } from '../math';
import { PAPER_STOCK, sheetMass } from '../paper';
import {
  A4_PORTRAIT, a4AreaPlate, dartFixture, dihedralPlateModel, flatDeltaModel, flatPlateModel, foldedModel,
  gliderFixture, NEUTRAL_TRIM, trimOf,
} from '../testing/fixtures';
import type { Airframe, Mat3, PosedModel, Vec3 } from '../types';
import { buildAirframe } from './build';
import { STANDARD_GRAVITY } from './constants';
import { laminaMassProps } from './massProps';
import { deltaSlope, helmboldSlope, plateAddedMass, plateAddedMassCoefficient, surfaceCoefficients } from './surfaces';

const RHO_PAPER = PAPER_STOCK.gsm / 1000;

const elementArea = (af: Airframe, pick: (role: string) => boolean = () => true): number =>
  af.elements.filter((e) => pick(e.role)).reduce((s, e) => s + e.area, 0);

function expectSymmetricPositiveDefinite(m: Mat3): void {
  expect(m[1]).toBeCloseTo(m[3], 15);
  expect(m[2]).toBeCloseTo(m[6], 15);
  expect(m[5]).toBeCloseTo(m[7], 15);
  // Sylvester: leading principal minors.
  expect(m[0]).toBeGreaterThan(0);
  expect(m[0] * m[4] - m[1] * m[3]).toBeGreaterThan(0);
  expect(mat3Det(m)).toBeGreaterThan(0);
}

describe('mass properties', () => {
  it('rectangle: mass, CG and inertia match the closed forms', () => {
    const b = 0.3;
    const c = 0.1;
    const af = buildAirframe(flatPlateModel(b, c), NEUTRAL_TRIM);
    const m = RHO_PAPER * b * c;
    expect(af.mass).toBeCloseTo(m, 12);
    expect(af.cg[0]).toBeCloseTo(c / 2, 12);
    expect(af.cg[1]).toBeCloseTo(0, 12);
    expect(af.cg[2]).toBeCloseTo(0, 12);
    // Plate in the x-z plane: chord along x, span along z.
    expect(af.inertia[0]).toBeCloseTo((m * b * b) / 12, 12); // roll, about x
    expect(af.inertia[8]).toBeCloseTo((m * c * c) / 12, 12); // pitch, about z
    expect(af.inertia[4]).toBeCloseTo((m * (b * b + c * c)) / 12, 12); // yaw, about y
    for (const i of [1, 2, 3, 5, 6, 7]) expect(af.inertia[i]).toBeCloseTo(0, 14);
    expectSymmetricPositiveDefinite(af.inertia);
  });

  it('triangle: mass, CG and inertia match the closed forms', () => {
    const b = 0.14;
    const h = 0.28;
    const af = buildAirframe(flatDeltaModel(b, h), NEUTRAL_TRIM);
    const m = (RHO_PAPER * b * h) / 2;
    expect(af.mass).toBeCloseTo(m, 12);
    expect(af.cg[0]).toBeCloseTo(h / 3, 12); // base at the tail, apex forward
    expect(af.inertia[8]).toBeCloseTo((m * h * h) / 18, 12); // about the centroidal axis parallel to the base
    expect(af.inertia[0]).toBeCloseTo((m * b * b) / 24, 12); // isosceles triangle about its axis of symmetry
    expect(af.inertia[4]).toBeCloseTo(af.inertia[0] + af.inertia[8], 12); // lamina: perpendicular-axis theorem
    expectSymmetricPositiveDefinite(af.inertia);
  });

  it('obeys the parallel-axis theorem for an added point mass', () => {
    const b = 0.3;
    const c = 0.1;
    const model = flatPlateModel(b, c);
    const bare = buildAirframe(model, NEUTRAL_TRIM);
    const clip = { mass: 0.0005, x: 0.09 };
    const af = buildAirframe(model, trimOf({ clip }));
    const m = bare.mass;
    const total = m + clip.mass;
    expect(af.mass).toBeCloseTo(total, 12);
    const xg = (m * (c / 2) + clip.mass * clip.x) / total;
    expect(af.cg[0]).toBeCloseTo(xg, 12);
    // Two bodies on the x axis: reduced mass times separation squared adds to the pitch and yaw inertia.
    const extra = ((m * clip.mass) / total) * (clip.x - c / 2) ** 2;
    expect(af.inertia[8]).toBeCloseTo(bare.inertia[8] + extra, 12);
    expect(af.inertia[4]).toBeCloseTo(bare.inertia[4] + extra, 12);
    expect(af.inertia[0]).toBeCloseTo(bare.inertia[0], 12);
  });

  it('inertia about the CG does not depend on where the body sits', () => {
    const model = dartFixture({ dihedralDeg: 8, keelSpreadDeg: 10 });
    const base = laminaMassProps(model.pieces, RHO_PAPER);
    const shift: Vec3 = [0.4, -0.2, 0.13];
    const moved = model.pieces.map((p) => ({
      ...p,
      verts: p.verts.map((v): Vec3 => [v[0] + shift[0], v[1] + shift[1], v[2] + shift[2]]),
    }));
    const other = laminaMassProps(moved, RHO_PAPER);
    for (let i = 0; i < 3; i++) expect(other.cg[i]).toBeCloseTo(base.cg[i] + shift[i], 12);
    for (let i = 0; i < 9; i++) expect(other.inertia[i]).toBeCloseTo(base.inertia[i], 12);
  });

  it('folded fixtures conserve the A4 sheet: 4.99 g, layers add mass', () => {
    const sheet = sheetMass(A4_PORTRAIT);
    expect(sheet).toBeCloseTo(0.0049896, 7);
    for (const model of [dartFixture(), dartFixture({ layering: 'classic' }), gliderFixture(), a4AreaPlate(3)]) {
      const af = buildAirframe(model, NEUTRAL_TRIM);
      expect(af.mass).toBeCloseTo(sheet, 9);
      expectSymmetricPositiveDefinite(af.inertia);
      // Left-right symmetric: CG on the centreline, no xz / yz products... Ixz stays, Ixy may be non-zero.
      expect(af.cg[2]).toBeCloseTo(0, 12);
      expect(af.inertia[2]).toBeCloseTo(0, 12);
      expect(af.inertia[5]).toBeCloseTo(0, 12);
    }
  });

  it('a layered nose moves the CG forward', () => {
    const classic = buildAirframe(dartFixture({ layering: 'classic' }), NEUTRAL_TRIM);
    const spread = buildAirframe(dartFixture({ layering: 'spread' }), NEUTRAL_TRIM);
    expect(classic.cg[0]).toBeGreaterThan(spread.cg[0]);
    expect(classic.cgFromNose).toBeGreaterThan(0.4);
    expect(classic.cgFromNose).toBeLessThan(0.6);
  });
});

describe('aerodynamic elements', () => {
  const planform = (model: PosedModel): number => {
    // Union area of the fixtures: the base layer (layer 0) covers every other layer.
    const base = model.pieces.filter((p) => p.layer === 0);
    return laminaMassProps(base, 1).area;
  };

  it('cover the planform once: areas within 2 %, layers not double-counted', () => {
    const cases: [string, PosedModel][] = [
      ['plate AR 1', flatPlateModel(0.2, 0.2)],
      ['plate AR 6', flatPlateModel(0.6, 0.1)],
      ['delta', flatDeltaModel(0.14, 0.28)],
      ['dart', dartFixture()],
      ['dart classic', dartFixture({ layering: 'classic', dihedralDeg: 10, keelSpreadDeg: 20 })],
      ['glider', gliderFixture()],
      ['glider winglets', gliderFixture({ wingletAt: 0.13, wingletDeg: 70 })],
    ];
    for (const [name, model] of cases) {
      const af = buildAirframe(model, NEUTRAL_TRIM);
      const expected = planform(model);
      expect(Math.abs(elementArea(af) / expected - 1), name).toBeLessThan(0.02);
      // The paper itself is much more than the planform when layers overlap.
      const paper = laminaMassProps(model.pieces, 1).area;
      expect(paper).toBeGreaterThanOrEqual(expected - 1e-12);
    }
    const glider = gliderFixture();
    expect(laminaMassProps(glider.pieces, 1).area / planform(glider)).toBeGreaterThan(2);
  });

  it('use the prescribed strip counts and one element per strip on simple panels', () => {
    const plate = buildAirframe(flatPlateModel(0.3, 0.1), NEUTRAL_TRIM);
    expect(plate.elements).toHaveLength(20);
    const dart = buildAirframe(dartFixture(), NEUTRAL_TRIM);
    expect(dart.elements.filter((e) => e.role === 'wing')).toHaveLength(20);
    expect(dart.elements.filter((e) => e.role === 'fuselage')).toHaveLength(6);
    const glider = buildAirframe(gliderFixture({ wingletAt: 0.13, wingletDeg: 70 }), NEUTRAL_TRIM);
    expect(glider.elements.filter((e) => e.role === 'winglet')).toHaveLength(6);
  });

  it('describe a rectangular strip correctly', () => {
    const af = buildAirframe(flatPlateModel(0.3, 0.1), NEUTRAL_TRIM);
    for (const e of af.elements) {
      expect(e.chord).toBeCloseTo(0.1, 12);
      expect(e.area).toBeCloseTo(0.1 * 0.015, 12);
      expect(e.le[0]).toBeCloseTo(0.1, 12);
      expect(e.chordDir).toEqual([-1, 0, 0]);
      expect(e.normal).toEqual([0, 1, 0]);
      expect(e.exposure).toBe(1);
      expect(e.wettedFaces).toBe(2);
      expect(e.bendFrac).toBe(0);
    }
    const zs = af.elements.map((e) => e.le[2]).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(-0.1425, 12);
    expect(zs[19]).toBeCloseTo(0.1425, 12);
  });

  it('are mirror-symmetric left to right', () => {
    const af = buildAirframe(dartFixture({ dihedralDeg: 12, keelSpreadDeg: 30 }), NEUTRAL_TRIM);
    const right = af.elements.filter((e) => e.side === 1);
    const left = af.elements.filter((e) => e.side === -1);
    expect(right.length).toBe(left.length);
    for (const r of right) {
      const twin = left.find(
        (l) => l.role === r.role && Math.hypot(l.le[0] - r.le[0], l.le[1] - r.le[1], l.le[2] + r.le[2]) < 1e-9,
      );
      expect(twin).toBeDefined();
      expect(twin!.area).toBeCloseTo(r.area, 12);
      expect(twin!.normal[1]).toBeCloseTo(r.normal[1], 12);
      expect(twin!.normal[2]).toBeCloseTo(-r.normal[2], 12);
    }
  });

  it('closed keel walls shield each other; exposure and wetted faces rise smoothly with the spread', () => {
    const wall = (spreadDeg: number) =>
      buildAirframe(dartFixture({ keelSpreadDeg: spreadDeg }), NEUTRAL_TRIM).elements.find((e) => e.role === 'fuselage')!;
    expect(wall(0).exposure).toBeCloseTo(0.5, 12);
    expect(wall(0).wettedFaces).toBeCloseTo(1, 12);
    expect(wall(19).wettedFaces).toBeCloseTo(1, 12);
    expect(wall(30).exposure).toBeCloseTo(0.75, 6);
    expect(wall(60).exposure).toBeCloseTo(1, 12);
    expect(wall(90).exposure).toBeCloseTo(1, 12);
    expect(wall(40).wettedFaces).toBeCloseTo(2, 12);
    let prevE = 0;
    let prevW = 0;
    for (let s = 0; s <= 70; s += 2) {
      const w = wall(s);
      expect(w.exposure).toBeGreaterThanOrEqual(prevE);
      expect(w.wettedFaces).toBeGreaterThanOrEqual(prevW);
      expect(w.exposure - prevE).toBeLessThan(0.55);
      if (s > 0) {
        expect(w.exposure - prevE).toBeLessThan(0.03);
        expect(w.wettedFaces - prevW).toBeLessThan(0.16);
      }
      prevE = w.exposure;
      prevW = w.wettedFaces;
    }
  });
});

describe('trim bends', () => {
  it('elevator bends both wings the same way, aileron opposite ways, rudder bends the walls', () => {
    const model = dartFixture();
    const af = buildAirframe(model, trimOf({ elevatorDeg: 6, aileronDeg: 2, rudderDeg: 5, elevatorChordFrac: 0.15 }));
    for (const e of af.elements) {
      if (e.role === 'wing') {
        expect(e.bendFrac).toBe(0.15);
        // Positive elevator = trailing edge up = toward +normal; positive aileron raises the right trailing edge.
        expect(e.bendRad).toBeCloseTo((6 + e.side * 2) * DEG, 12);
      } else {
        expect(e.role).toBe('fuselage');
        expect(e.bendFrac).toBe(0.15);
        // Positive rudder = trailing edge toward +z. Right wall normal points to -z, left wall normal to +z.
        expect(Math.sign(e.normal[2])).toBe(-e.side);
        expect(e.bendRad).toBeCloseTo(-e.side * 5 * DEG, 12);
      }
    }
    const neutral = buildAirframe(model, NEUTRAL_TRIM);
    expect(neutral.elements.every((e) => e.bendFrac === 0 && e.bendRad === 0)).toBe(true);
  });

  it('aileron on a centre panel follows the sign of z', () => {
    const af = buildAirframe(flatPlateModel(0.3, 0.1), trimOf({ aileronDeg: 3 }));
    for (const e of af.elements) expect(e.bendRad).toBeCloseTo(Math.sign(e.le[2]) * 3 * DEG, 12);
  });
});

describe('lifting surfaces', () => {
  it('rectangular plates get the straight-wing constants of doc 01 section 10.1', () => {
    const expected: [number, number, number, number, number][] = [
      // AR, Kp, Kv, alpha_s deg, stall width deg
      [1, 1.483, 2.3, 35, 10],
      [3, 3.363, 0, 12.5, 4],
      [6, 4.529, 0, 9.2, 4],
    ];
    for (const [ar, kp, kv, stall, width] of expected) {
      const af = buildAirframe(a4AreaPlate(ar), NEUTRAL_TRIM);
      expect(af.surfaces).toHaveLength(1);
      const s = af.surfaces[0];
      expect(s.role).toBe('wing');
      expect(s.aspectRatio).toBeCloseTo(ar, 9);
      expect(s.deltaness).toBe(0);
      expect(s.kp).toBeCloseTo(kp, 3);
      expect(s.kv).toBeCloseTo(kv, 9);
      expect(s.alphaStall / DEG).toBeCloseTo(stall, 1);
      expect(s.stallWidth / DEG).toBeCloseTo(width, 9);
      expect(s.cd90).toBeCloseTo(Math.max(1.17, 1.11 + 0.018 * ar), 9);
      expect(s.k0).toBe(0.25);
      expect(s.flapEfficiency).toBe(0.8);
      expect(af.elements.every((e) => e.surface === 0)).toBe(true);
    }
  });

  it('a slender delta gets the delta constants', () => {
    const af = buildAirframe(flatDeltaModel(0.14, 0.28), NEUTRAL_TRIM);
    const s = af.surfaces[0];
    expect(s.aspectRatio).toBeCloseTo(1, 9);
    expect(s.deltaness).toBe(1);
    expect(s.kp).toBeCloseTo(1.257, 3);
    expect(s.kv).toBeCloseTo(Math.PI, 12);
    expect(s.alphaStall / DEG).toBeCloseTo(35, 9);
    expect(s.stallWidth / DEG).toBeCloseTo(20, 9);
    expect(s.k0).toBe(0.5);
  });

  it('formulas reproduce the tables of doc 01 section 3', () => {
    expect(helmboldSlope(0.5)).toBeCloseTo(0.773, 3);
    expect(helmboldSlope(2)).toBeCloseTo(2.603, 3);
    expect(deltaSlope(0.5)).toBeCloseTo(0.645, 3);
    expect(deltaSlope(2)).toBeCloseTo(2.3, 3);
    expect(deltaSlope(3)).toBeCloseTo(3.078, 3);
    expect(surfaceCoefficients(0.5, 0).alphaStall / DEG).toBeCloseTo(45, 9);
    expect(surfaceCoefficients(2, 0).alphaStall / DEG).toBeCloseTo(18.6, 1);
    expect(surfaceCoefficients(2, 0).kv).toBeCloseTo(1.15, 9);
    expect(surfaceCoefficients(20, 0).cd90).toBeCloseTo(1.47, 9);
    expect(surfaceCoefficients(0.05, 0).cd90).toBeCloseTo(1.47, 9);
  });

  it('constants move without jumps while the planform morphs from a rectangle into a delta', () => {
    // Trapezoid: full root chord, tip chord shrinking to zero.
    const span = 0.2;
    const root = 0.2;
    let prev: Airframe | null = null;
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const tip = root * (1 - i / steps);
      const h = span / 2;
      const model = foldedModel({
        paper: A4_PORTRAIT,
        layers: [{ outline: [[0, 0], [h, 0], [h, tip], [0, root]] }],
        keelDepth: 0,
      });
      const af = buildAirframe(model, NEUTRAL_TRIM);
      if (prev) {
        const a = prev.surfaces[0];
        const b = af.surfaces[0];
        expect(Math.abs(b.deltaness - a.deltaness)).toBeLessThan(0.08);
        expect(Math.abs(b.kp - a.kp)).toBeLessThan(0.06);
        expect(Math.abs(b.kv - a.kv)).toBeLessThan(0.25);
        expect(Math.abs(b.k0 - a.k0)).toBeLessThan(0.02);
        expect(Math.abs(b.stallWidth - a.stallWidth) / DEG).toBeLessThan(1);
        expect(Math.abs(b.alphaStall - a.alphaStall) / DEG).toBeLessThan(1);
      }
      prev = af;
    }
    expect(prev!.surfaces[0].deltaness).toBe(1);
  });

  it('dart: wing pair, one fuselage surface with the reflection-plane aspect ratio', () => {
    const model = dartFixture();
    const af = buildAirframe(model, NEUTRAL_TRIM);
    expect(af.surfaces.map((s) => s.role)).toEqual(['wing', 'fuselage']);
    const [wing, keel] = af.surfaces;
    expect(wing.span).toBeCloseTo(0.16, 9);
    expect(wing.deltaness).toBe(1);
    expect(wing.aspectRatio).toBeGreaterThan(1);
    expect(wing.aspectRatio).toBeLessThan(1.3);
    const wallArea = elementArea(af, (r) => r === 'fuselage') / 2;
    expect(keel.span).toBeCloseTo(0.025, 9);
    expect(keel.area).toBeCloseTo(wallArea, 12);
    expect(keel.aspectRatio).toBeCloseTo((2 * 0.025 ** 2) / wallArea, 9);
    expect(keel.kp).toBeCloseTo(helmboldSlope(keel.aspectRatio), 9);
    expect(keel.k0).toBe(0.25);
    for (const e of af.elements) expect(e.surface).toBe(e.role === 'wing' ? 0 : 1);
  });

  it('a winglet folded flat is part of the wing; folded up it is its own surface', () => {
    const plain = buildAirframe(gliderFixture(), NEUTRAL_TRIM);
    const flat = buildAirframe(gliderFixture({ wingletAt: 0.13, wingletDeg: 0 }), NEUTRAL_TRIM);
    expect(flat.ref.area).toBeCloseTo(plain.ref.area, 9);
    expect(flat.ref.span).toBeCloseTo(plain.ref.span, 9);
    const flatLet = flat.surfaces.find((s) => s.role === 'winglet')!;
    expect(flatLet.kp).toBeCloseTo(plain.surfaces[0].kp, 9);
    expect(flatLet.alphaStall).toBeCloseTo(plain.surfaces[0].alphaStall, 9);

    const up = buildAirframe(gliderFixture({ wingletAt: 0.13, wingletDeg: 90 }), NEUTRAL_TRIM);
    expect(up.surfaces.map((s) => s.role)).toEqual(['wing', 'fuselage', 'winglet', 'winglet']);
    expect(up.ref.span).toBeCloseTo(2 * 0.13 - 2 * 0.015, 9);
    const upLet = up.surfaces[2];
    expect(upLet.aspectRatio).toBeCloseTo(0.0185 / 0.09, 6);
    expect(upLet.kp).toBeCloseTo(helmboldSlope(upLet.aspectRatio), 9);
  });
});

describe('reference quantities, layers, contact points', () => {
  it('rectangular plate', () => {
    const af = buildAirframe(flatPlateModel(0.3, 0.1), NEUTRAL_TRIM);
    expect(af.ref.area).toBeCloseTo(0.03, 12);
    expect(af.ref.span).toBeCloseTo(0.3, 12);
    expect(af.ref.mac).toBeCloseTo(0.1, 12);
    expect(af.ref.macLeX).toBeCloseTo(0.1, 12);
    expect(af.ref.aspectRatio).toBeCloseTo(3, 12);
    expect(af.ref.length).toBeCloseTo(0.1, 12);
    expect(af.ref.wingLoading).toBeCloseTo(RHO_PAPER * STANDARD_GRAVITY, 9);
    expect(af.cgFromNose).toBeCloseTo(0.5, 12);
    expect(af.maxLayers).toBe(1);
  });

  it('delta: MAC is two thirds of the root chord and starts one third behind the apex', () => {
    const af = buildAirframe(flatDeltaModel(0.14, 0.28), NEUTRAL_TRIM);
    expect(af.ref.area).toBeCloseTo(0.0196, 9);
    expect(af.ref.mac).toBeCloseTo((2 / 3) * 0.28, 2);
    expect(af.ref.macLeX).toBeCloseTo((2 / 3) * 0.28, 2);
    expect(af.cgFromNose).toBeCloseTo(2 / 3, 9);
  });

  it('projected area and span shrink with dihedral', () => {
    const flat = buildAirframe(dihedralPlateModel(0.3, 0.1, 0), NEUTRAL_TRIM);
    const vee = buildAirframe(dihedralPlateModel(0.3, 0.1, 30), NEUTRAL_TRIM);
    expect(flat.ref.area).toBeCloseTo(0.03, 12);
    expect(vee.ref.area).toBeCloseTo(0.03 * Math.cos(30 * DEG), 9);
    expect(vee.ref.span).toBeCloseTo(0.3 * Math.cos(30 * DEG), 9);
  });

  it('counts the thickest stack', () => {
    expect(buildAirframe(gliderFixture({ keelSpreadDeg: 40 }), NEUTRAL_TRIM).maxLayers).toBe(7);
    // Walls pressed together lie on each other.
    expect(buildAirframe(gliderFixture(), NEUTRAL_TRIM).maxLayers).toBe(14);
    expect(buildAirframe(dartFixture({ layering: 'classic', keelSpreadDeg: 40 }), NEUTRAL_TRIM).maxLayers).toBe(4);
  });

  it('contact points include the nose, the tail, both tips and the keel bottom', () => {
    const af = buildAirframe(dartFixture(), NEUTRAL_TRIM);
    const has = (p: Vec3): boolean =>
      af.contactPoints.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-9);
    expect(has([0.297, 0, 0])).toBe(true); // nose, also the front of the keel line
    expect(has([0, 0, 0])).toBe(true); // tail of the keel line (lowest point)
    expect(has([0, 0.025, 0.08])).toBe(true); // right tip, trailing corner
    expect(has([0, 0.025, -0.08])).toBe(true);
    expect(af.contactPoints.length).toBeLessThanOrEqual(16);
    const up = buildAirframe(gliderFixture({ wingletAt: 0.13, wingletDeg: 90 }), NEUTRAL_TRIM);
    const top = Math.max(...up.contactPoints.map((p) => p[1]));
    expect(top).toBeCloseTo(0.015 + 0.0185, 9);
  });
});

describe('apparent mass', () => {
  it('reproduces the worked example of doc 01 section 7 and the AR < 1 rule', () => {
    expect(plateAddedMassCoefficient(1)).toBeCloseTo(0.58, 12);
    expect(plateAddedMassCoefficient(2)).toBeCloseTo(0.76, 12);
    expect(plateAddedMassCoefficient(5)).toBeCloseTo(0.9, 12);
    expect(plateAddedMassCoefficient(50)).toBeCloseTo(0.99, 12);
    // c = 0.10 m, b = 0.20 m: 1.43 g.
    expect(plateAddedMass(1.204, 0.2, 0.1) * 1e3).toBeCloseTo(1.43, 1);
    // The shorter side is the reference dimension whichever way round the plate is.
    expect(plateAddedMass(1.204, 0.1, 0.2)).toBeCloseTo(plateAddedMass(1.204, 0.2, 0.1), 15);

    const wide = buildAirframe(flatPlateModel(0.2, 0.1), NEUTRAL_TRIM);
    const long = buildAirframe(flatPlateModel(0.1, 0.2), NEUTRAL_TRIM);
    for (const af of [wide, long]) {
      expect(af.apparentMass[4] * 1e3).toBeCloseTo(1.437, 3); // normal to the plate: body y
      expect(af.apparentMass[0]).toBeCloseTo(0, 12); // nothing in the plate's own plane
      expect(af.apparentMass[8]).toBeCloseTo(0, 12);
      expect(af.apparentMass[4] / af.mass).toBeGreaterThan(0.25);
    }
  });

  it('gives roll and pitch apparent inertia of the right size and no yaw inertia for a flat plate', () => {
    const b = 0.2;
    const c = 0.1;
    const af = buildAirframe(flatPlateModel(b, c), NEUTRAL_TRIM);
    const ma = af.apparentMass[4];
    // Uniform strips: roll inertia = m_a b² / 12 (midpoint rule over 20 strips: 0.25 % low).
    expect(af.apparentInertia[0]).toBeCloseTo((ma * b * b) / 12, 7);
    // Pitch about mid-chord (the CG): scaled strip value rho pi c^4 b / 128.
    const scale = ma / ((1.204 * Math.PI * c * c * b) / 4);
    expect(af.apparentInertia[8]).toBeCloseTo((scale * 1.204 * Math.PI * c ** 4 * b) / 128, 10);
    expect(af.apparentInertia[4]).toBeCloseTo(0, 12);
  });

  it('a vertical keel adds sideways apparent mass, counted once for walls pressed together', () => {
    const closed = buildAirframe(dartFixture(), NEUTRAL_TRIM);
    const open = buildAirframe(dartFixture({ keelSpreadDeg: 60 }), NEUTRAL_TRIM);
    expect(closed.apparentMass[8]).toBeGreaterThan(0);
    expect(closed.apparentMass[8]).toBeLessThan(0.2 * closed.mass);
    expect(closed.apparentMass[4] / closed.mass).toBeGreaterThan(0.2);
    expect(closed.apparentMass[4] / closed.mass).toBeLessThan(0.8);
    // Tensors stay symmetric and positive semi-definite.
    for (const m of [closed.apparentMass, closed.apparentInertia, open.apparentMass, open.apparentInertia]) {
      expect(m[1]).toBeCloseTo(m[3], 15);
      expect(m[2]).toBeCloseTo(m[6], 15);
      expect(m[5]).toBeCloseTo(m[7], 15);
      expect(m[0]).toBeGreaterThanOrEqual(0);
      expect(m[4]).toBeGreaterThanOrEqual(0);
      expect(m[8]).toBeGreaterThanOrEqual(0);
    }
  });
});
