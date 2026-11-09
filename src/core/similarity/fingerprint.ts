import type { Airframe, Fingerprint, PosedModel, Vec3 } from '../types';

/** Grid resolution of the top-view raster (docs/ARCHITECTURE.md section 8: 24 x 24). */
export const FINGERPRINT_GRID = 24;
/** Samples per cell side; 3 x 3 supersampling (similarity task spec). */
export const FINGERPRINT_SUPERSAMPLE = 3;

const SAMPLES = FINGERPRINT_GRID * FINGERPRINT_SUPERSAMPLE;
const SAMPLES_PER_CELL = FINGERPRINT_SUPERSAMPLE * FINGERPRINT_SUPERSAMPLE;

/**
 * A piece whose top-view area is below this fraction of its true area is treated as a vertical wall
 * and skipped. 1e-3 is a projection within about 0.06 degrees of vertical (design choice).
 */
const MIN_PROJECTED_FRACTION = 1e-3;
/** Pieces smaller than this are slivers (docs/ARCHITECTURE.md section 5.1: drop slivers below 1e-12 m²). */
const SLIVER_AREA = 1e-12;

// Module-level scratch so the raster hot path does not allocate. Core is single-threaded.
const sampleAcc = new Float64Array(SAMPLES * SAMPLES);
let polyU = new Float64Array(32);
let polyV = new Float64Array(32);

function ensurePolyCapacity(n: number): void {
  if (polyU.length >= n) return;
  let cap = polyU.length;
  while (cap < n) cap *= 2;
  polyU = new Float64Array(cap);
  polyV = new Float64Array(cap);
}

/** Area of a planar 3D polygon (half the length of the Newell normal). */
function polygonArea3(verts: readonly Vec3[]): number {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const n = verts.length;
  for (let k = 0; k < n; k++) {
    const a = verts[k];
    const b = verts[k + 1 === n ? 0 : k + 1];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return 0.5 * Math.hypot(nx, ny, nz);
}

/**
 * Point-in-convex-polygon with the top-left fill rule. The polygon is (polyU, polyV)[0..n) with the
 * given orientation sign (+1 counter-clockwise in (u, v), -1 clockwise). A point exactly on an edge
 * belongs to exactly one of two convex pieces that share that edge, so adjacent pieces of one layer
 * never double count a sample.
 */
function insideConvex(n: number, sign: number, pu: number, pv: number): boolean {
  for (let k = 0; k < n; k++) {
    const k1 = k + 1 === n ? 0 : k + 1;
    const au = polyU[k];
    const av = polyV[k];
    const du = polyU[k1] - au;
    const dv = polyV[k1] - av;
    const c = (du * (pv - av) - dv * (pu - au)) * sign;
    if (c > 0) continue;
    if (c < 0) return false;
    // On the edge line: keep only "left" or "top" edges of the CCW-oriented polygon.
    const sdu = du * sign;
    const sdv = dv * sign;
    if (!(sdv < 0 || (sdv === 0 && sdu < 0))) return false;
  }
  return true;
}

/**
 * Rasterise the model's top view into a GRID x GRID layer-count grid, normalised to max 1.
 * Layout: row-major, row i runs along body x from tail (i = 0) to nose, column j along body z from
 * left (-z, j = 0) to right. The bounding box is scaled uniformly by max(length, span) and centred.
 */
export function topViewGrid(model: PosedModel): number[] {
  const grid = new Array<number>(FINGERPRINT_GRID * FINGERPRINT_GRID).fill(0);
  const pieces = model.pieces;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const piece of pieces) {
    for (const v of piece.verts) {
      if (v[0] < minX) minX = v[0];
      if (v[0] > maxX) maxX = v[0];
      if (v[2] < minZ) minZ = v[2];
      if (v[2] > maxZ) maxZ = v[2];
    }
  }
  const extent = Math.max(maxX - minX, maxZ - minZ);
  if (!(extent > 0) || !Number.isFinite(extent)) return grid;

  // Map body (x, z) to sample-space (u, v); sample (p, q) sits at (p + 0.5, q + 0.5).
  const scale = SAMPLES / extent;
  const u0 = 0.5 * (minX + maxX) - 0.5 * extent;
  const v0 = 0.5 * (minZ + maxZ) - 0.5 * extent;

  sampleAcc.fill(0);
  for (const piece of pieces) {
    const verts = piece.verts;
    const n = verts.length;
    if (n < 3) continue;
    const trueArea = polygonArea3(verts);
    if (trueArea < SLIVER_AREA) continue;

    ensurePolyCapacity(n);
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    let twiceArea = 0;
    for (let k = 0; k < n; k++) {
      const u = (verts[k][0] - u0) * scale;
      const v = (verts[k][2] - v0) * scale;
      polyU[k] = u;
      polyV[k] = v;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    for (let k = 0; k < n; k++) {
      const k1 = k + 1 === n ? 0 : k + 1;
      twiceArea += polyU[k] * polyV[k1] - polyU[k1] * polyV[k];
    }
    const projectedArea = Math.abs(twiceArea) * 0.5 / (scale * scale);
    if (projectedArea < MIN_PROJECTED_FRACTION * trueArea) continue;
    const sign = twiceArea > 0 ? 1 : -1;

    const p0 = Math.max(0, Math.ceil(uMin - 0.5));
    const p1 = Math.min(SAMPLES - 1, Math.floor(uMax - 0.5));
    const q0 = Math.max(0, Math.ceil(vMin - 0.5));
    const q1 = Math.min(SAMPLES - 1, Math.floor(vMax - 0.5));
    for (let p = p0; p <= p1; p++) {
      const pu = p + 0.5;
      const row = p * SAMPLES;
      for (let q = q0; q <= q1; q++) {
        if (insideConvex(n, sign, pu, q + 0.5)) sampleAcc[row + q] += 1;
      }
    }
  }

  let max = 0;
  const ss = FINGERPRINT_SUPERSAMPLE;
  for (let i = 0; i < FINGERPRINT_GRID; i++) {
    for (let j = 0; j < FINGERPRINT_GRID; j++) {
      let sum = 0;
      for (let a = 0; a < ss; a++) {
        const row = (i * ss + a) * SAMPLES + j * ss;
        for (let b = 0; b < ss; b++) sum += sampleAcc[row + b];
      }
      const value = sum / SAMPLES_PER_CELL;
      grid[i * FINGERPRINT_GRID + j] = value;
      if (value > max) max = value;
    }
  }
  if (max > 0) {
    const inv = 1 / max;
    for (let k = 0; k < grid.length; k++) grid[k] *= inv;
  }
  return grid;
}

/**
 * Shape fingerprint of a posed model: top-view layer grid plus scale-free features
 * (docs/ARCHITECTURE.md section 8, types.ts Fingerprint).
 */
export function fingerprint(model: PosedModel, airframe: Airframe): Fingerprint {
  const sheetArea = model.paper.width * model.paper.height;
  const length = model.length;
  return {
    grid: topViewGrid(model),
    aspectRatio: airframe.ref.aspectRatio,
    cgFromNose: airframe.cgFromNose,
    areaRatio: sheetArea > 0 ? airframe.ref.area / sheetArea : 0,
    keelDepthRatio: length > 0 ? model.height / length : 0,
    slenderness: length > 0 ? model.span / length : 0,
  };
}
