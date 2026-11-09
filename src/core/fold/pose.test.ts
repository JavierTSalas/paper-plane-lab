import { describe, expect, it } from 'vitest';
import { DEG } from '../math';
import { A4, dartSteps, LETTER, lockSteps, valley } from './fixtures';
import {
  buildPlane, createSheet, defaultShape, finalHingeAngles, foldFlat, isSymmetric, piecePolygon, poseModel, SHAPE_STEP,
} from './index';
import { polygonArea, sharedStretch } from './invariants';
import type {
  FlatState, FoldLine, FoldStep, HingeAngles, Panel, PaperSpec, PlaneDesign, PosedModel, PosedPiece, ShapeSpec, Vec2, Vec3,
} from '../types';

const W = A4.width;
const H = A4.height;
const CX = W / 2;
const FLAT: HingeAngles = { keel: 0, wing: 0, winglet: 0 };

/** A line parallel to the centreline, `offset` to the right of it. */
const lineAt = (offset: number, paper: PaperSpec = A4): FoldLine => ({
  a: [paper.width / 2 + offset, 0],
  b: [paper.width / 2 + offset, paper.height],
});

const shapeOf = (over: Partial<ShapeSpec> = {}): ShapeSpec => ({
  keel: 'valley',
  keelSpreadDeg: 0,
  wingLine: lineAt(0.015),
  dihedralDeg: 0,
  wingletLine: null,
  wingletDeg: 0,
  ...over,
});

const dart = foldFlat(A4, dartSteps(A4)).final;
const lock = foldFlat(A4, lockSteps(A4)).final;

function pose(flat: FlatState, shape: ShapeSpec, angles?: HingeAngles): PosedModel {
  const { model, issues } = poseModel(flat, shape, angles);
  expect(issues).toEqual([]);
  return model;
}

/* ---------------------------- 3D helpers ---------------------------- */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const mirrorZ = (a: Vec3): Vec3 => [a[0], a[1], -a[2]];

function expectVec(actual: Vec3, expected: Vec3, digits = 12): void {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
  expect(actual[2]).toBeCloseTo(expected[2], digits);
}

/** Area vector of a 3D polygon: its length is the area, its direction the right-hand normal of the vertex order. */
function areaVector(verts: readonly Vec3[]): Vec3 {
  let sum: Vec3 = [0, 0, 0];
  for (let i = 1; i + 1 < verts.length; i++) {
    const c = cross(sub(verts[i], verts[0]), sub(verts[i + 1], verts[0]));
    sum = [sum[0] + c[0] / 2, sum[1] + c[1] / 2, sum[2] + c[2] / 2];
  }
  return sum;
}

const posedArea = (model: PosedModel): number => model.pieces.reduce((sum, p) => sum + length(areaVector(p.verts)), 0);

function centroid3(verts: readonly Vec3[]): Vec3 {
  const n = verts.length;
  return [
    verts.reduce((s, v) => s + v[0], 0) / n,
    verts.reduce((s, v) => s + v[1], 0) / n,
    verts.reduce((s, v) => s + v[2], 0) / n,
  ];
}

/** True when the point lies on the piece: in its plane and inside its outline, within tol. */
function covers(piece: PosedPiece, p: Vec3, tol: number): boolean {
  const area = areaVector(piece.verts);
  const n: Vec3 = [area[0] / length(area), area[1] / length(area), area[2] / length(area)];
  if (Math.abs(dot(n, sub(p, piece.verts[0]))) > tol) return false;
  return piece.verts.every((a, i) => {
    const b = piece.verts[(i + 1) % piece.verts.length];
    const edge = sub(b, a);
    return dot(cross(edge, sub(p, a)), n) >= -tol * length(edge);
  });
}

/** Where a sheet point of a posed piece lies in the body frame. */
function bodyPoint(piece: PosedPiece, p: Vec2): Vec3 {
  const s0 = piece.sheet[0];
  const e1: Vec2 = [piece.sheet[1][0] - s0[0], piece.sheet[1][1] - s0[1]];
  let k = 2;
  let best = 0;
  for (let i = 2; i < piece.sheet.length; i++) {
    const c = Math.abs(e1[0] * (piece.sheet[i][1] - s0[1]) - e1[1] * (piece.sheet[i][0] - s0[0]));
    if (c > best) {
      best = c;
      k = i;
    }
  }
  const e2: Vec2 = [piece.sheet[k][0] - s0[0], piece.sheet[k][1] - s0[1]];
  const det = e1[0] * e2[1] - e1[1] * e2[0];
  const u = ((p[0] - s0[0]) * e2[1] - (p[1] - s0[1]) * e2[0]) / det;
  const v = (e1[0] * (p[1] - s0[1]) - e1[1] * (p[0] - s0[0])) / det;
  const a = sub(piece.verts[1], piece.verts[0]);
  const b = sub(piece.verts[k], piece.verts[0]);
  return [
    piece.verts[0][0] + u * a[0] + v * b[0],
    piece.verts[0][1] + u * a[1] + v * b[1],
    piece.verts[0][2] + u * a[2] + v * b[2],
  ];
}

const panelOf = (model: PosedModel, piece: PosedPiece): Panel => model.panels[piece.panel];
const piecesOf = (model: PosedModel, role: string, side?: number): PosedPiece[] =>
  model.pieces.filter((p) => panelOf(model, p).role === role && (side === undefined || panelOf(model, p).side === side));
const findPanel = (model: PosedModel, role: string, side: number): Panel => {
  const panel = model.panels.find((p) => p.role === role && p.side === side);
  if (!panel) throw new Error(`no ${role} panel on side ${side}`);
  return panel;
};

/* ---------------------------- whole-model checks ---------------------------- */

/** Bookkeeping every posed model must satisfy, whatever the shape. */
function expectSound(model: PosedModel, flat: FlatState): void {
  const { width, height } = flat.paper;
  expect(model.pieces.every((p) => p.verts.every((v) => v.every(Number.isFinite)))).toBe(true);
  expect(posedArea(model)).toBeCloseTo(width * height, 12);
  expect(model.pieces.reduce((sum, p) => sum + polygonArea(p.sheet), 0)).toBeCloseTo(width * height, 12);

  const xs = model.pieces.flatMap((p) => p.verts.map((v) => v[0]));
  const ys = model.pieces.flatMap((p) => p.verts.map((v) => v[1]));
  const zs = model.pieces.flatMap((p) => p.verts.map((v) => v[2]));
  expect(Math.min(...xs)).toBeCloseTo(0, 12);
  expect(model.length).toBeCloseTo(Math.max(...xs), 12);
  expect(model.span).toBeCloseTo(Math.max(...zs) - Math.min(...zs), 12);
  expect(model.height).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 12);

  model.panels.forEach((panel, index) => {
    expect(panel.index).toBe(index);
    expect(length(panel.normal)).toBeCloseTo(1, 12);
    expect(panel.pieceIds.length).toBeGreaterThan(0);
    for (const id of panel.pieceIds) expect(model.pieces[id].panel).toBe(index);
  });
  expect(model.panels.reduce((sum, p) => sum + p.pieceIds.length, 0)).toBe(model.pieces.length);

  model.pieces.forEach((piece, index) => {
    const panel = panelOf(model, piece);
    expect(piece.id).toBe(index);
    expect(piece.verts).toHaveLength(piece.sheet.length);
    // Rigid: the posed outline is congruent to the sheet outline, edge by edge and in area.
    piece.verts.forEach((v, i) => {
      const j = (i + 1) % piece.verts.length;
      const sheetEdge = Math.hypot(piece.sheet[j][0] - piece.sheet[i][0], piece.sheet[j][1] - piece.sheet[i][1]);
      expect(length(sub(piece.verts[j], v))).toBeCloseTo(sheetEdge, 12);
      // Every vertex lies in its panel plane.
      expect(dot(sub(v, panel.origin), panel.normal)).toBeCloseTo(0, 12);
    });
    // The sheet polygon runs counter-clockwise seen from the front face.
    const area = areaVector(piece.verts);
    expectVec([area[0] / length(area), area[1] / length(area), area[2] / length(area)], piece.frontNormal, 9);
    expect(Math.abs(dot(piece.frontNormal, panel.stackDir))).toBeCloseTo(1, 12);
  });
}

/** Every point of the model has its mirror image in the plane z = 0. */
function expectMirrored(model: PosedModel, tol = 1e-9): void {
  for (const panel of model.panels) {
    const twin = findPanel(model, panel.role, -panel.side || 0);
    expectVec(twin.normal, mirrorZ(panel.normal), 12);
    expectVec(twin.stackDir, mirrorZ(panel.stackDir), 12);
    expectVec(twin.origin, mirrorZ(panel.origin), 12);
    const area = (p: Panel): number => p.pieceIds.reduce((sum, id) => sum + length(areaVector(model.pieces[id].verts)), 0);
    expect(area(twin)).toBeCloseTo(area(panel), 12);
    const others = twin.pieceIds.map((id) => model.pieces[id]);
    for (const id of panel.pieceIds) {
      const piece = model.pieces[id];
      for (const point of [...piece.verts, centroid3(piece.verts)]) {
        expect(others.some((other) => covers(other, mirrorZ(point), tol)), `mirror image of ${point} on the ${panel.role} panel`).toBe(true);
      }
    }
  }
}

/** Paper does not tear: wherever two posed pieces share a sheet edge they meet in space. Returns the joins found between panels. */
function expectJoined(model: PosedModel): Set<string> {
  const joins = new Set<string>();
  const { pieces } = model;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const p = pieces[i];
      const q = pieces[j];
      for (let k = 0; k < p.sheet.length; k++) {
        for (let m = 0; m < q.sheet.length; m++) {
          const shared = sharedStretch(p.sheet[k], p.sheet[(k + 1) % p.sheet.length], q.sheet[m], q.sheet[(m + 1) % q.sheet.length]);
          if (!shared) continue;
          for (const end of shared) {
            expect(length(sub(bodyPoint(p, end), bodyPoint(q, end))), `pieces ${i} and ${j} meet`).toBeLessThan(1e-9);
          }
          if (p.panel !== q.panel) {
            const a = panelOf(model, p);
            const b = panelOf(model, q);
            joins.add([`${a.role}${a.side}`, `${b.role}${b.side}`].sort().join('|'));
          }
        }
      }
    }
  }
  return joins;
}

/* ---------------------------- tests ---------------------------- */

describe('finalHingeAngles', () => {
  it('keel from the spread, wing from keel and dihedral, winglet as given', () => {
    const angles = finalHingeAngles(shapeOf({ keelSpreadDeg: 20, dihedralDeg: 8, wingletDeg: -45 }));
    expect(angles.keel).toBeCloseTo(80 * DEG, 14);
    expect(angles.wing).toBeCloseTo(72 * DEG, 14);
    expect(angles.winglet).toBeCloseTo(-45 * DEG, 14);
    expect(finalHingeAngles(shapeOf({ keel: 'mountain' }))).toEqual({ keel: Math.PI / 2, wing: Math.PI / 2, winglet: 0 });
  });

  it('without a keel the wing line is a dihedral break', () => {
    const angles = finalHingeAngles(shapeOf({ keel: 'none', keelSpreadDeg: 30, dihedralDeg: 12, wingletDeg: 70 }));
    expect(angles.keel).toBe(0);
    expect(angles.wing).toBeCloseTo(-12 * DEG, 14);
    expect(angles.winglet).toBeCloseTo(70 * DEG, 14);
  });
});

describe('poseModel', () => {
  const shapes: Array<[string, ShapeSpec]> = [
    ['valley keel, pressed flat', shapeOf()],
    ['valley keel, spread and dihedral', shapeOf({ keelSpreadDeg: 24, dihedralDeg: 9 })],
    ['mountain keel', shapeOf({ keel: 'mountain', keelSpreadDeg: 10, dihedralDeg: 5 })],
    ['valley keel with winglets up', shapeOf({ dihedralDeg: 4, wingletLine: lineAt(0.085), wingletDeg: 70 })],
    ['mountain keel with winglets down', shapeOf({ keel: 'mountain', keelSpreadDeg: 16, wingletLine: lineAt(0.08), wingletDeg: -50 })],
    ['slanted wing and winglet lines', shapeOf({ keelSpreadDeg: 12, dihedralDeg: 6, wingLine: { a: [CX + 0.004, H], b: [CX + 0.03, 0] }, wingletLine: { a: [CX + 0.09, 0], b: [CX + 0.05, H] }, wingletDeg: 35 })],
    ['no keel, dihedral break', shapeOf({ keel: 'none', dihedralDeg: 10 })],
    ['no keel, break and winglets', shapeOf({ keel: 'none', dihedralDeg: 7, wingletLine: lineAt(0.09), wingletDeg: 80 })],
    ['no keel, winglets only', shapeOf({ keel: 'none', wingLine: null, wingletLine: lineAt(0.07), wingletDeg: 60 })],
    ['flat flying wing', shapeOf({ keel: 'none', wingLine: null })],
    ['keel only', shapeOf({ wingLine: null, keelSpreadDeg: 40 })],
  ];

  describe.each(shapes)('%s', (_name, shape) => {
    it.each([['dart', dart], ['lock', lock], ['plain sheet', createSheet(A4)]])('%s: sound, symmetric, untorn', (_flat, flat) => {
      const model = pose(flat, shape);
      expectSound(model, flat);
      expectMirrored(model);
      expectJoined(model);
      expect(model.angles).toEqual(finalHingeAngles(shape));
      // Side +1 is the starboard half (z >= 0), side -1 the port half; the centre panel straddles z = 0.
      for (const piece of model.pieces) {
        const { side } = panelOf(model, piece);
        for (const v of piece.verts) expect(v[2] * side).toBeGreaterThanOrEqual(-1e-12);
      }
    });

    it('stays sound, symmetric and untorn at intermediate hinge angles', () => {
      for (const angles of [FLAT, { keel: 0.4, wing: 0.1, winglet: 0.3 }, { keel: 1.2, wing: 1.5, winglet: -0.8 }, { keel: Math.PI / 2, wing: Math.PI, winglet: 2 }]) {
        const model = pose(dart, shape, angles);
        expectSound(model, dart);
        expectMirrored(model);
        expectJoined(model);
      }
    });
  });

  it('joins the walls at the keel, each wing to its wall and each winglet to its wing', () => {
    const model = pose(dart, shapeOf({ keelSpreadDeg: 20, dihedralDeg: 6, wingletLine: lineAt(0.085), wingletDeg: 60 }));
    expect(model.panels.map((p) => `${p.role}${p.side}`)).toEqual(['fuselage1', 'fuselage-1', 'wing1', 'wing-1', 'winglet1', 'winglet-1']);
    const joins = expectJoined(model);
    expect([...joins].sort()).toEqual(['fuselage-1|fuselage1', 'fuselage-1|wing-1', 'fuselage1|wing1', 'wing-1|winglet-1', 'wing1|winglet1']);
  });

  it('with all angles zero is the flat layout: x = table y, z = s (table x - centre), y = 0', () => {
    for (const [shape, s] of [[shapeOf({ wingletLine: lineAt(0.08), wingletDeg: 40 }), 1], [shapeOf({ keel: 'mountain' }), -1], [shapeOf({ keel: 'none' }), 1]] as const) {
      const model = pose(dart, shape, FLAT);
      expect(model.height).toBe(0);
      expect(model.length).toBeCloseTo(H, 12);
      expect(model.span).toBeCloseTo(W, 12);
      for (const piece of model.pieces) {
        const mid: Vec2 = [
          piece.sheet.reduce((sum, v) => sum + v[0], 0) / piece.sheet.length,
          piece.sheet.reduce((sum, v) => sum + v[1], 0) / piece.sheet.length,
        ];
        const source = dart.pieces.find((p) => p.sheet.every((a, i) => {
          const b = p.sheet[(i + 1) % p.sheet.length];
          return (b[0] - a[0]) * (mid[1] - a[1]) - (b[1] - a[1]) * (mid[0] - a[0]) >= -1e-12;
        }))!;
        const [a, b, c, d, tx, ty] = source.iso;
        piece.sheet.forEach((v, i) => {
          const table: Vec2 = [a * v[0] + b * v[1] + tx, c * v[0] + d * v[1] + ty];
          expectVec(piece.verts[i], [table[1], 0, s * (table[0] - CX)]);
        });
        expect(piece.layer).toBe(source.layer);
        expectVec(panelOf(model, piece).normal, [0, 1, 0]);
        expectVec(piece.frontNormal, [0, source.flipped ? -s : s, 0]);
      }
    }
  });

  describe('wings', () => {
    it('are level at dihedral 0: normal straight up, at the top of the walls', () => {
      for (const keel of ['valley', 'mountain'] as const) {
        const model = pose(dart, shapeOf({ keel, keelSpreadDeg: 0 }));
        for (const side of [1, -1]) {
          expectVec(findPanel(model, 'wing', side).normal, [0, 1, 0]);
          for (const piece of piecesOf(model, 'wing', side)) {
            for (const v of piece.verts) expect(v[1]).toBeCloseTo(0.015, 12);
          }
        }
        expect(model.height).toBeCloseTo(0.015, 12);
        expect(model.span).toBeCloseTo(W - 0.03, 12);
        expect(model.length).toBeCloseTo(H, 12);
      }
    });

    it('stay level at dihedral 0 whatever the spread', () => {
      const model = pose(dart, shapeOf({ keelSpreadDeg: 50 }));
      expectVec(findPanel(model, 'wing', 1).normal, [0, 1, 0]);
      expectVec(findPanel(model, 'wing', -1).normal, [0, 1, 0]);
      const root = 0.015 * Math.cos(25 * DEG);
      for (const piece of piecesOf(model, 'wing')) {
        for (const v of piece.verts) expect(v[1]).toBeCloseTo(root, 12);
      }
      expect(model.span).toBeCloseTo(W - 0.03 + 2 * 0.015 * Math.sin(25 * DEG), 12);
    });

    it('tilt with the dihedral: tips above the roots, normals leaning inboard', () => {
      for (const keel of ['valley', 'mountain', 'none'] as const) {
        const dihedral = 12 * DEG;
        const model = pose(dart, shapeOf({ keel, dihedralDeg: 12 }));
        expectVec(findPanel(model, 'wing', 1).normal, [0, Math.cos(dihedral), -Math.sin(dihedral)]);
        expectVec(findPanel(model, 'wing', -1).normal, [0, Math.cos(dihedral), Math.sin(dihedral)]);
        const rootY = keel === 'none' ? 0 : 0.015;
        const rootZ = keel === 'none' ? 0.015 : 0;
        for (const side of [1, -1]) {
          const verts = piecesOf(model, 'wing', side).flatMap((p) => p.verts);
          for (const v of verts) {
            // Height grows with the distance from the root at the tangent of the dihedral.
            expect(v[1] - rootY).toBeCloseTo((side * v[2] - rootZ) * Math.tan(dihedral), 12);
          }
          const tip = verts.reduce((far, v) => (side * v[2] > side * far[2] ? v : far));
          expect(tip[1]).toBeCloseTo(rootY + (W / 2 - 0.015) * Math.sin(dihedral), 12);
        }
      }
    });

    it('droop with negative dihedral', () => {
      const model = pose(dart, shapeOf({ dihedralDeg: -10 }));
      const tip = piecesOf(model, 'wing', 1).flatMap((p) => p.verts).reduce((far, v) => (v[2] > far[2] ? v : far));
      expect(tip[1]).toBeLessThan(0.015);
      expectVec(findPanel(model, 'wing', 1).normal, [0, Math.cos(10 * DEG), Math.sin(10 * DEG)]);
    });
  });

  describe('fuselage walls', () => {
    it('are vertical and coincide at spread 0', () => {
      for (const keel of ['valley', 'mountain'] as const) {
        const model = pose(dart, shapeOf({ keel, keelSpreadDeg: 0, dihedralDeg: 7 }));
        expectVec(findPanel(model, 'fuselage', 1).normal, [0, 0, -1]);
        expectVec(findPanel(model, 'fuselage', -1).normal, [0, 0, 1]);
        const walls = piecesOf(model, 'fuselage');
        expect(walls.length).toBeGreaterThan(1);
        for (const piece of walls) {
          for (const v of piece.verts) {
            expect(v[2]).toBeCloseTo(0, 12);
            expect(v[1]).toBeGreaterThanOrEqual(-1e-12);
            expect(v[1]).toBeLessThanOrEqual(0.015 + 1e-12);
          }
        }
      }
    });

    it('open symmetrically by the spread angle', () => {
      const model = pose(dart, shapeOf({ keelSpreadDeg: 40 }));
      const half = 20 * DEG;
      expectVec(findPanel(model, 'fuselage', 1).normal, [0, Math.sin(half), -Math.cos(half)]);
      expectVec(findPanel(model, 'fuselage', -1).normal, [0, Math.sin(half), Math.cos(half)]);
      for (const side of [1, -1]) {
        for (const piece of piecesOf(model, 'fuselage', side)) {
          for (const v of piece.verts) expect(side * v[2]).toBeCloseTo(v[1] * Math.tan(half), 12);
        }
      }
    });

    it('keep the keel line on the x axis', () => {
      const model = pose(dart, shapeOf({ keelSpreadDeg: 30, dihedralDeg: 5 }));
      const onKeel = model.pieces.flatMap((p) => p.verts).filter((v) => Math.abs(v[2]) < 1e-12);
      expect(onKeel.length).toBeGreaterThan(3);
      for (const v of onKeel) expect(v[1]).toBeCloseTo(0, 12);
      // Nose and tail of the dart both lie on it.
      expect(onKeel.some((v) => Math.abs(v[0]) < 1e-12)).toBe(true);
      expect(onKeel.some((v) => Math.abs(v[0] - H) < 1e-12)).toBe(true);
    });
  });

  describe('winglets', () => {
    const shape = (deg: number): ShapeSpec => shapeOf({ wingletLine: lineAt(0.085), wingletDeg: deg });

    it('stand up from the wing by the winglet angle', () => {
      const model = pose(dart, shape(90));
      expectVec(findPanel(model, 'winglet', 1).normal, [0, 0, -1]);
      expectVec(findPanel(model, 'winglet', -1).normal, [0, 0, 1]);
      for (const piece of piecesOf(model, 'winglet')) {
        for (const v of piece.verts) {
          // The walls are pressed together, so the wing starts at z = 0 and the winglet line is 70 mm out.
          expect(Math.abs(v[2])).toBeCloseTo(0.085 - 0.015, 12);
          expect(v[1]).toBeGreaterThanOrEqual(0.015 - 1e-12);
        }
      }
      expect(model.height).toBeCloseTo(0.015 + (W / 2 - 0.085), 12);
      expect(model.span).toBeCloseTo(2 * (0.085 - 0.015), 12);
    });

    it('hang down for a negative angle', () => {
      const model = pose(dart, shape(-90));
      expectVec(findPanel(model, 'winglet', 1).normal, [0, 0, 1]);
      const lowest = Math.min(...piecesOf(model, 'winglet').flatMap((p) => p.verts.map((v) => v[1])));
      expect(lowest).toBeCloseTo(0.015 - (W / 2 - 0.085), 12);
    });

    it('add to the dihedral of the wing they sit on', () => {
      const model = pose(dart, shapeOf({ dihedralDeg: 10, wingletLine: lineAt(0.085), wingletDeg: 30 }));
      const tilt = 40 * DEG;
      expectVec(findPanel(model, 'winglet', 1).normal, [0, Math.cos(tilt), -Math.sin(tilt)]);
    });
  });

  describe('which face ends up on top', () => {
    const sheet = createSheet(A4);

    it('valley keel: the face seen while folding (stackDir = +normal)', () => {
      const model = pose(sheet, shapeOf({ keel: 'valley', dihedralDeg: 5, keelSpreadDeg: 20 }));
      for (const panel of model.panels) expectVec(panel.stackDir, panel.normal);
      // An unfolded sheet shows its front: the wings carry it on top.
      for (const piece of piecesOf(model, 'wing')) expect(piece.frontNormal[1]).toBeGreaterThan(0.9);
      // Table right is starboard.
      const right = model.pieces.find((p) => p.sheet.every((v) => v[0] >= CX + 0.015 - 1e-12))!;
      expect(panelOf(model, right)).toMatchObject({ role: 'wing', side: 1 });
    });

    it('mountain keel: the face on the table (stackDir = -normal)', () => {
      const model = pose(sheet, shapeOf({ keel: 'mountain', dihedralDeg: 5, keelSpreadDeg: 20 }));
      for (const panel of model.panels) expectVec(panel.stackDir, [-panel.normal[0], -panel.normal[1], -panel.normal[2]]);
      for (const piece of piecesOf(model, 'wing')) expect(piece.frontNormal[1]).toBeLessThan(-0.9);
      // Turned over: table right is port.
      const right = model.pieces.find((p) => p.sheet.every((v) => v[0] >= CX + 0.015 - 1e-12))!;
      expect(panelOf(model, right)).toMatchObject({ role: 'wing', side: -1 });
    });

    it('no keel: the face seen while folding', () => {
      const model = pose(sheet, shapeOf({ keel: 'none', wingLine: null }));
      expect(model.panels).toHaveLength(1);
      expect(model.panels[0]).toMatchObject({ role: 'center', side: 0, normal: [0, 1, 0], stackDir: [0, 1, 0] });
      expectVec(model.pieces[0].frontNormal, [0, 1, 0]);
    });

    it('layers stack the same way: folded-in flaps lie on the top of a valley-keeled wing and under a mountain-keeled one', () => {
      for (const [keel, sign] of [['valley', 1], ['mountain', -1]] as const) {
        const model = pose(dart, shapeOf({ keel }));
        const wing = piecesOf(model, 'wing', 1);
        const base = wing.reduce((low, p) => (p.layer < low.layer ? p : low));
        expect(base.frontNormal[1] * sign).toBeCloseTo(1, 12);
        const flap = wing.reduce((high, p) => (p.layer > high.layer ? p : high));
        expect(flap.layer).toBeGreaterThan(base.layer);
        expect(findPanel(model, 'wing', 1).stackDir[1]).toBeCloseTo(sign, 12);
      }
    });
  });

  describe('shape validation', () => {
    const invalid = (shape: ShapeSpec, count = 1): PosedModel => {
      const { model, issues } = poseModel(dart, shape);
      expect(issues).toHaveLength(count);
      for (const issue of issues) expect(issue).toMatchObject({ step: SHAPE_STEP, severity: 'error', code: 'shape-line-invalid' });
      expectSound(model, dart);
      expectMirrored(model);
      return model;
    };

    it('a wing line on the left half, across the centreline, off the model or degenerate is ignored', () => {
      for (const wingLine of [
        lineAt(-0.02),
        { a: [CX - 0.01, 0], b: [CX + 0.03, H] } as FoldLine,
        lineAt(0.2),
        { a: [0, 0.1], b: [W, 0.1] } as FoldLine,
        { a: [CX + 0.02, 0.1], b: [CX + 0.02, 0.1] } as FoldLine,
      ]) {
        const model = invalid(shapeOf({ wingLine }));
        expect(model.panels.map((p) => p.role)).toEqual(['fuselage', 'fuselage']);
      }
    });

    it('a winglet line inboard of the wing line or off the model is ignored', () => {
      for (const wingletLine of [lineAt(0.01), lineAt(0.11), { a: [CX + 0.01, 0], b: [CX + 0.05, H] } as FoldLine]) {
        const model = invalid(shapeOf({ wingletLine, wingletDeg: 45 }));
        expect(model.panels.map((p) => p.role)).toEqual(['fuselage', 'fuselage', 'wing', 'wing']);
      }
    });

    it('reports both lines when both are bad', () => {
      invalid(shapeOf({ wingLine: lineAt(-0.01), wingletLine: lineAt(0.3) }), 2);
    });

    it('warns when the flat model is lopsided, and still poses it', () => {
      const lopsided = foldFlat(A4, dartSteps(A4).slice(0, 2)).final;
      expect(isSymmetric(lopsided)).toBe(false);
      const { model, issues } = poseModel(lopsided, shapeOf());
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ step: SHAPE_STEP, severity: 'warning', code: 'not-symmetric' });
      expectSound(model, lopsided);
      expectJoined(model);
    });
  });
});

describe('hand-traced airplanes', () => {
  const depth = 0.018;

  /** Checks any finished airplane must pass. `noseY` is the table height of the nose. */
  function expectAirplane(flat: FlatState, shape: ShapeSpec, noseY: number): PosedModel {
    expect(isSymmetric(flat)).toBe(true);
    const model = pose(flat, shape);
    expectSound(model, flat);
    expectMirrored(model);
    expectJoined(model);
    expect(model.panels.map((p) => `${p.role}${p.side}`)).toEqual(['fuselage1', 'fuselage-1', 'wing1', 'wing-1']);

    // Tail at x = 0, nose at x = length, on the fuselage.
    expect(model.length).toBeCloseTo(noseY, 12);
    const foremost = model.pieces.flatMap((p) => p.verts.filter((v) => v[0] > model.length - 1e-9).map((v) => ({ v, panel: panelOf(model, p) })));
    expect(foremost.length).toBeGreaterThan(0);
    for (const { panel } of foremost) expect(panel.role).toBe('fuselage');
    expect(foremost.some(({ v }) => Math.abs(v[1]) < 1e-12 && Math.abs(v[2]) < 1e-12)).toBe(true);

    // The keel is the lowest line; walls rise from it; the wings sit on top of the walls.
    const half = (shape.keelSpreadDeg / 2) * DEG;
    const rootHeight = depth * Math.cos(half);
    for (const piece of model.pieces) {
      for (const v of piece.verts) expect(v[1]).toBeGreaterThanOrEqual(-1e-12);
    }
    for (const piece of piecesOf(model, 'fuselage')) {
      for (const v of piece.verts) expect(v[1]).toBeLessThanOrEqual(rootHeight + 1e-12);
    }
    for (const piece of piecesOf(model, 'wing')) {
      for (const v of piece.verts) {
        expect(v[1]).toBeGreaterThanOrEqual(rootHeight - 1e-12);
        expect(Math.abs(v[2])).toBeGreaterThanOrEqual(depth * Math.sin(half) - 1e-12);
      }
    }
    const dihedral = shape.dihedralDeg * DEG;
    const reach = flat.paper.width / 2 - depth;
    expect(model.span).toBeCloseTo(2 * (depth * Math.sin(half) + reach * Math.cos(dihedral)), 12);
    expect(model.height).toBeCloseTo(rootHeight + reach * Math.sin(dihedral), 12);
    return model;
  }

  const shapes: Array<[string, ShapeSpec]> = [
    ['valley keel, pressed and level', shapeOf({ wingLine: lineAt(depth) })],
    ['valley keel, spread with dihedral', shapeOf({ wingLine: lineAt(depth), keelSpreadDeg: 14, dihedralDeg: 7 })],
    ['mountain keel, pressed and level', shapeOf({ keel: 'mountain', wingLine: lineAt(depth) })],
    ['mountain keel, spread with dihedral', shapeOf({ keel: 'mountain', wingLine: lineAt(depth), keelSpreadDeg: 14, dihedralDeg: 7 })],
  ];

  describe('blunt-nose dart', () => {
    // Classic dart, then the nose folded down by 30 mm.
    const drop = 0.03;
    const noseY = H - drop;
    const steps = [...dartSteps(A4), valley({ a: [0, noseY], b: [W, noseY] })];
    const { final, frames, issues } = foldFlat(A4, steps);
    const tan = Math.tan(Math.PI / 8);

    it('folds as traced by hand', () => {
      expect(issues).toEqual([]);
      // The tip is a triangle of height `drop` with a 45 degree apex, four layers thick: the sheet
      // (one piece across the centreline), a corner flap on each half, and on each half the sheet and
      // the corner flap again, brought over by the edge fold.
      const last = frames[frames.length - 1];
      const moved = last.split.filter((p) => last.movingIds.includes(p.id));
      expect(moved.reduce((sum, p) => sum + polygonArea(p.sheet), 0)).toBeCloseTo(4 * drop * drop * tan, 12);
      expect(moved).toHaveLength(7);
      // It lands on top, pointing at the tail.
      const top = [...final.pieces].sort((p, q) => q.layer - p.layer).slice(0, 7);
      expect(top.map((p) => p.id).sort()).toEqual(moved.map((p) => p.id).sort());
      const tipY = Math.min(...top.flatMap((p) => piecePolygon(p).map((v) => v[1])));
      expect(tipY).toBeCloseTo(H - 2 * drop, 12);
      // The blunt nose is 2 drop tan(22.5 deg) wide, narrower than the fuselage.
      const nose = final.pieces.flatMap(piecePolygon).filter((v) => Math.abs(v[1] - noseY) < 1e-9);
      expect(Math.min(...nose.map((v) => v[0]))).toBeCloseTo(CX - drop * tan, 12);
      expect(Math.max(...nose.map((v) => v[0]))).toBeCloseTo(CX + drop * tan, 12);
      expect(drop * tan).toBeLessThan(depth);
    });

    it.each(shapes)('%s: a sane airplane', (_name, shape) => {
      const model = expectAirplane(final, shape, noseY);
      // The folded nose rides inside a valley keel and outside a mountain keel.
      const wall = piecesOf(model, 'fuselage', 1);
      const outermost = wall.reduce((high, p) => (p.layer > high.layer ? p : high));
      expect(outermost.verts.every((v) => v[0] >= H - 2 * drop - 1e-12)).toBe(true);
      const outboard = findPanel(model, 'fuselage', 1).stackDir[2];
      expect(Math.sign(outboard)).toBe(shape.keel === 'mountain' ? 1 : -1);
    });
  });

  describe('Nakamura lock', () => {
    const gap = 0.02;
    const noseY = H - W / 2 - gap;
    const tipFold = noseY - W / 2;
    const { final, issues } = foldFlat(A4, lockSteps(A4, gap));

    it('folds as traced by hand', () => {
      expect(issues).toEqual([]);
      const outline = final.pieces.flatMap(piecePolygon);
      // A right-angled nose on the centreline, straight edges below the second corner folds.
      const nose = outline.filter((v) => Math.abs(v[1] - noseY) < 1e-9);
      expect(nose.length).toBeGreaterThan(0);
      for (const v of nose) expect(v[0]).toBeCloseTo(CX, 12);
      expect(Math.min(...outline.map((v) => v[0]))).toBeCloseTo(0, 12);
      expect(Math.max(...outline.map((v) => v[0]))).toBeCloseTo(W, 12);
      expect(Math.min(...outline.map((v) => v[1]))).toBeCloseTo(0, 12);
      expect(Math.max(...outline.map((v) => v[1]))).toBeCloseTo(noseY, 12);
      // The lock: the top two layers are the little triangle, holding the corner flaps down.
      const top = [...final.pieces].sort((p, q) => q.layer - p.layer).slice(0, 2);
      for (const piece of top) {
        for (const [x, y] of piecePolygon(piece)) {
          expect(y).toBeGreaterThanOrEqual(tipFold - 1e-12);
          expect(y).toBeLessThanOrEqual(tipFold + gap + 1e-12);
          expect(Math.abs(x - CX)).toBeLessThanOrEqual(gap + 1e-12);
        }
      }
      expect(top.reduce((sum, p) => sum + polygonArea(p.sheet), 0)).toBeCloseTo(gap * gap, 12);
    });

    it.each(shapes)('%s: a sane airplane', (_name, shape) => {
      const model = expectAirplane(final, shape, noseY);
      // The nose is a single point on the keel line.
      const foremost = model.pieces.flatMap((p) => p.verts).filter((v) => v[0] > model.length - 1e-9);
      for (const v of foremost) expectVec(v, [noseY, 0, 0]);
      // The lock triangle lies within the fuselage depth.
      expect(gap).toBeLessThan(depth + 0.005);
    });
  });
});

describe('defaultShape', () => {
  it('gives a valley keel, a wing line at 12 % of the half-width, 8 degrees of dihedral and no winglets', () => {
    const shape = defaultShape(dart);
    expect(shape).toMatchObject({ keel: 'valley', keelSpreadDeg: 10, dihedralDeg: 8, wingletLine: null, wingletDeg: 0 });
    expect(shape.wingLine?.a[0]).toBeCloseTo(CX + 0.12 * CX, 12);
    expect(shape.wingLine?.b[0]).toBeCloseTo(CX + 0.12 * CX, 12);
    const model = pose(dart, shape);
    expect(model.panels.map((p) => p.role)).toEqual(['fuselage', 'fuselage', 'wing', 'wing']);
    expectSound(model, dart);
    expectMirrored(model);
  });

  it('always cuts the model, however narrow it has been folded', () => {
    const narrow: FoldStep[] = [];
    for (const offset of [0.06, 0.03, 0.012, 0.005]) {
      narrow.push(valley({ a: [CX - offset, 0], b: [CX - offset, H] }), valley({ a: [CX + offset, H], b: [CX + offset, 0] }));
    }
    for (let count = 0; count <= narrow.length; count += 2) {
      const { final, issues } = foldFlat(A4, narrow.slice(0, count));
      expect(issues).toEqual([]);
      const shape = defaultShape(final);
      const model = pose(final, shape);
      expect(model.panels.map((p) => p.role)).toEqual(['fuselage', 'fuselage', 'wing', 'wing']);
      expect(Math.min(...model.panels.map((p) => p.pieceIds.length))).toBeGreaterThan(0);
      expectSound(model, final);
    }
  });

  it('works on other sheets', () => {
    for (const flat of [createSheet(LETTER), foldFlat(LETTER, dartSteps(LETTER)).final, foldFlat(LETTER, lockSteps(LETTER)).final]) {
      const model = pose(flat, defaultShape(flat));
      expectSound(model, flat);
      expectMirrored(model);
    }
  });
});

describe('buildPlane', () => {
  const design = (steps: FoldStep[], shape: ShapeSpec): PlaneDesign => ({
    v: 1,
    id: 'test',
    name: 'Test',
    category: 'custom',
    paper: A4,
    steps,
    shape,
    trim: { elevatorDeg: 0, elevatorChordFrac: 0.2, aileronDeg: 0, rudderDeg: 0, clip: null },
  });

  it('folds and poses in one go', () => {
    const shape = shapeOf({ keelSpreadDeg: 10, dihedralDeg: 8 });
    const built = buildPlane(design(dartSteps(A4), shape));
    expect(built.issues).toEqual([]);
    expect(built.fold.final).toEqual(dart);
    expect(built.model).toEqual(pose(dart, shape));
  });

  it('reports fold issues first, then shape issues', () => {
    const steps = [...dartSteps(A4), valley({ a: [1, 0], b: [1, 1] })];
    const built = buildPlane(design(steps, shapeOf({ wingLine: lineAt(-0.03) })));
    expect(built.issues.map((i) => [i.step, i.code])).toEqual([[5, 'line-misses-paper'], [SHAPE_STEP, 'shape-line-invalid']]);
    expect(built.fold.issues).toHaveLength(1);
    expectSound(built.model, dart);
  });
});
