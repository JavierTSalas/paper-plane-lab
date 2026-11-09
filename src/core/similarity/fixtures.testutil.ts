/**
 * Hand-made PosedModels for similarity tests, built straight from the type contract
 * (the real fold engine is developed in parallel). Test-only; not exported from index.ts.
 */
import type { Airframe, Mat3, PaperSpec, PosedModel, PosedPiece, Vec3 } from '../types';

export const A4: PaperSpec = { sizeId: 'a4', width: 0.21, height: 0.297, front: '#fff', back: '#fff' };
export const A5: PaperSpec = { sizeId: 'a5', width: 0.148, height: 0.21, front: '#fff', back: '#fff' };

export interface FixtureSpec {
  paper: PaperSpec;
  /** Single-layer wing outline pieces; their top-view area is the reference wing area. */
  outline: Vec3[][];
  /** Further layers and walls: mass and grid only. */
  extra: Vec3[][];
}

export interface Fixture {
  model: PosedModel;
  airframe: Airframe;
  spec: FixtureSpec;
}

const ZERO_M3: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

function newell(verts: readonly Vec3[]): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let k = 0; k < verts.length; k++) {
    const a = verts[k];
    const b = verts[(k + 1) % verts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx / 2, ny / 2, nz / 2];
}

function area3(verts: readonly Vec3[]): number {
  const n = newell(verts);
  return Math.hypot(n[0], n[1], n[2]);
}

function centroid3(verts: readonly Vec3[]): Vec3 {
  // Fan triangulation centroid; pieces are convex.
  let a = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let k = 1; k + 1 < verts.length; k++) {
    const t = [verts[0], verts[k], verts[k + 1]];
    const ta = area3(t);
    a += ta;
    cx += (ta * (t[0][0] + t[1][0] + t[2][0])) / 3;
    cy += (ta * (t[0][1] + t[1][1] + t[2][1])) / 3;
    cz += (ta * (t[0][2] + t[1][2] + t[2][2])) / 3;
  }
  return a > 0 ? [cx / a, cy / a, cz / a] : verts[0];
}

export function buildFixture(spec: FixtureSpec): Fixture {
  const all = [...spec.outline, ...spec.extra];
  const pieces: PosedPiece[] = all.map((verts, i) => {
    const n = newell(verts);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return {
      id: i,
      panel: i < spec.outline.length ? 1 : 0,
      verts,
      sheet: verts.map((v) => [v[2], v[0]] as const),
      frontNormal: [n[0] / l, n[1] / l, n[2] / l],
      layer: i,
    };
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pieces)
    for (const v of p.verts) {
      minX = Math.min(minX, v[0]);
      maxX = Math.max(maxX, v[0]);
      minY = Math.min(minY, v[1]);
      maxY = Math.max(maxY, v[1]);
      minZ = Math.min(minZ, v[2]);
      maxZ = Math.max(maxZ, v[2]);
    }
  const model: PosedModel = {
    paper: spec.paper,
    angles: { keel: 0, wing: 0, winglet: 0 },
    pieces,
    panels: [],
    length: maxX - minX,
    span: maxZ - minZ,
    height: maxY - minY,
  };

  let mass = 0;
  let cgx = 0;
  for (const p of pieces) {
    const a = area3(p.verts);
    mass += a;
    cgx += a * centroid3(p.verts)[0];
  }
  cgx /= mass;
  const wingArea = spec.outline.reduce((s, v) => s + Math.abs(newell(v)[1]), 0);
  const span = model.span;
  const airframe: Airframe = {
    mass,
    cg: [cgx, 0, 0],
    inertia: ZERO_M3,
    apparentMass: ZERO_M3,
    apparentInertia: ZERO_M3,
    elements: [],
    surfaces: [],
    ref: {
      area: wingArea,
      span,
      mac: wingArea / span,
      macLeX: 0,
      aspectRatio: (span * span) / wingArea,
      length: model.length,
      wingLoading: 0,
    },
    cgFromNose: (maxX - cgx) / model.length,
    maxLayers: 1,
    contactPoints: [],
  };
  return { model, airframe, spec };
}

const mirrorZ = (v: Vec3): Vec3 => [v[0], v[1], -v[2]];
/** Mirror a polygon about z = 0, reversing the vertex order so the winding seen from +y is kept. */
const mirrorPoly = (p: Vec3[]): Vec3[] => p.map(mirrorZ).reverse();

/** Classic delta dart with a keel. Length 0.2 m, span 0.13 m, keel depth 0.03 m on A4. */
export function deltaDartSpec(paper: PaperSpec = A4, k = 1): FixtureSpec {
  const L = 0.2 * k;
  const b = 0.065 * k;
  const d = 0.03 * k;
  const rightWing: Vec3[] = [
    [0, d, 0],
    [0, d, b],
    [L, d, 0],
  ];
  const rightInner: Vec3[] = [
    [0, d, 0],
    [0, d, b * 0.45],
    [L, d, 0],
  ];
  const rightWall: Vec3[] = [
    [0.03 * k, 0, 0],
    [L, d, 0],
    [0, d, 0],
  ];
  return {
    paper,
    outline: [rightWing, mirrorPoly(rightWing)],
    extra: [rightInner, mirrorPoly(rightInner), rightWall, rightWall.slice().reverse()],
  };
}

/** Wide rectangular glider: wing 0.26 m x 0.1 m, doubled leading edge, shallow keel. */
export function gliderSpec(paper: PaperSpec = A4, k = 1): FixtureSpec {
  const L = 0.1 * k;
  const h = 0.13 * k;
  const d = 0.008 * k;
  const le = 0.07 * k;
  const rightWing: Vec3[] = [
    [0, d, 0],
    [L, d, 0],
    [L, d, h],
    [0, d, h],
  ];
  const rightLe: Vec3[] = [
    [le, d, 0],
    [L, d, 0],
    [L, d, h],
    [le, d, h],
  ];
  const wall: Vec3[] = [
    [0, 0, 0],
    [L, 0, 0],
    [L, d, 0],
    [0, d, 0],
  ];
  return {
    paper,
    outline: [rightWing, mirrorPoly(rightWing)],
    extra: [rightLe, mirrorPoly(rightLe), wall, wall.slice().reverse()],
  };
}

/** The dart with one extra paper layer folded over the nose. */
export function dartWithNoseLayerSpec(paper: PaperSpec = A4, k = 1): FixtureSpec {
  const base = deltaDartSpec(paper, k);
  const d = 0.03 * k;
  const nose: Vec3[] = [
    [0.15 * k, d, -0.016 * k],
    [0.15 * k, d, 0.016 * k],
    [0.2 * k, d, 0],
  ];
  return { ...base, extra: [...base.extra, nose] };
}

export function mirrorSpec(spec: FixtureSpec): FixtureSpec {
  return { ...spec, outline: spec.outline.map(mirrorPoly), extra: spec.extra.map(mirrorPoly) };
}

/** Same geometry in a different piece order (and therefore different ids and layers). */
export function reorderModel(model: PosedModel): PosedModel {
  const pieces = model.pieces
    .slice()
    .reverse()
    .map((p, i) => ({ ...p, id: 100 + i, layer: i }));
  return { ...model, pieces, paper: { ...model.paper, front: '#c33', back: '#33c' } };
}

/** Rotate each polygon's vertex list by `shift` (same polygon, same winding). */
export function rotateVertices(model: PosedModel, shift: number): PosedModel {
  const pieces = model.pieces.map((p) => {
    const n = p.verts.length;
    const s = ((shift % n) + n) % n;
    return { ...p, verts: [...p.verts.slice(s), ...p.verts.slice(0, s)] };
  });
  return { ...model, pieces };
}

/** A glider cut into `strips` spanwise strips per half, two layers each: 4 * strips pieces plus walls. */
export function stripGliderSpec(strips: number): FixtureSpec {
  const L = 0.1;
  const h = 0.13;
  const d = 0.008;
  const outline: Vec3[][] = [];
  const extra: Vec3[][] = [];
  for (let s = 0; s < strips; s++) {
    const z0 = (h * s) / strips;
    const z1 = (h * (s + 1)) / strips;
    const right: Vec3[] = [
      [0, d, z0],
      [L, d, z0],
      [L, d, z1],
      [0, d, z1],
    ];
    const rightLe: Vec3[] = [
      [0.05, d, z0],
      [L, d, z0],
      [L, d, z1],
      [0.05, d, z1],
    ];
    outline.push(right, mirrorPoly(right));
    extra.push(rightLe, mirrorPoly(rightLe));
  }
  return { paper: A4, outline, extra };
}
