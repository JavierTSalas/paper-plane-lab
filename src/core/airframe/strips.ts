import { cross3, dot3, norm3 } from '../math';
import type { Panel, PosedPiece, Vec3 } from '../types';

/** Chordwise intervals shorter than this are dropped, metres (0.1 mm, the paper's own thickness). */
const MIN_CHORD = 1e-4;
/** Intervals closer than this are one interval, metres. Cut neighbours of the fold engine share edges to about 1e-9. */
const JOIN_TOL = 1e-7;

/**
 * In-plane axes of a panel. `fwd` is the in-plane direction closest to the body +x axis (the chord axis,
 * pointing to the leading edge), `spanAxis` = fwd x normal (body +z for a horizontal panel).
 */
export interface PanelFrame {
  origin: Vec3;
  fwd: Vec3;
  spanAxis: Vec3;
  normal: Vec3;
}

export function panelFrame(panel: Panel, pieces: readonly PosedPiece[]): PanelFrame {
  const normal = norm3(panel.normal);
  let fx = 1 - normal[0] * normal[0];
  let fy = -normal[0] * normal[1];
  let fz = -normal[0] * normal[2];
  if (Math.hypot(fx, fy, fz) < 1e-6) {
    // The panel faces straight ahead. Any in-plane axis will do; take the one closest to body +y.
    fx = -normal[1] * normal[0];
    fy = 1 - normal[1] * normal[1];
    fz = -normal[1] * normal[2];
  }
  const fwd = norm3([fx, fy, fz]);
  // Put the frame origin on the plane the pieces really lie in (mean offset along the normal).
  let offset = 0;
  let count = 0;
  for (const id of panel.pieceIds) {
    for (const v of pieces[id].verts) {
      offset += (v[0] - panel.origin[0]) * normal[0] + (v[1] - panel.origin[1]) * normal[1] + (v[2] - panel.origin[2]) * normal[2];
      count++;
    }
  }
  const w = count > 0 ? offset / count : 0;
  return {
    origin: [panel.origin[0] + w * normal[0], panel.origin[1] + w * normal[1], panel.origin[2] + w * normal[2]],
    fwd,
    spanAxis: cross3(fwd, normal),
    normal,
  };
}

/** A piece in panel coordinates: flat arrays of u (chordwise, forward positive) and v (spanwise). */
export interface FlatPoly {
  u: number[];
  v: number[];
}

export interface PanelShape {
  frame: PanelFrame;
  polys: FlatPoly[];
  vMin: number;
  vMax: number;
}

export function projectPanel(panel: Panel, pieces: readonly PosedPiece[]): PanelShape {
  const frame = panelFrame(panel, pieces);
  const polys: FlatPoly[] = [];
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const id of panel.pieceIds) {
    const u: number[] = [];
    const v: number[] = [];
    for (const p of pieces[id].verts) {
      const rel: Vec3 = [p[0] - frame.origin[0], p[1] - frame.origin[1], p[2] - frame.origin[2]];
      const pv = dot3(rel, frame.spanAxis);
      u.push(dot3(rel, frame.fwd));
      v.push(pv);
      vMin = Math.min(vMin, pv);
      vMax = Math.max(vMax, pv);
    }
    if (u.length >= 3) polys.push({ u, v });
  }
  if (polys.length === 0) {
    vMin = 0;
    vMax = 0;
  }
  return { frame, polys, vMin, vMax };
}

/** Body-frame point of panel coordinates (u, v). */
export const panelPoint = (frame: PanelFrame, u: number, v: number): Vec3 => [
  frame.origin[0] + u * frame.fwd[0] + v * frame.spanAxis[0],
  frame.origin[1] + u * frame.fwd[1] + v * frame.spanAxis[1],
  frame.origin[2] + u * frame.fwd[2] + v * frame.spanAxis[2],
];

/** Chordwise extent [aft, fore] of every piece along the line v = const. Convex pieces give one interval each. */
function rawIntervals(polys: readonly FlatPoly[], v: number): [number, number][] {
  const out: [number, number][] = [];
  for (const poly of polys) {
    let lo = Infinity;
    let hi = -Infinity;
    const n = poly.u.length;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const va = poly.v[i] - v;
      const vb = poly.v[j] - v;
      if ((va > 0 && vb > 0) || (va < 0 && vb < 0)) continue;
      if (va === vb) {
        // Edge lies on the line.
        lo = Math.min(lo, poly.u[i], poly.u[j]);
        hi = Math.max(hi, poly.u[i], poly.u[j]);
        continue;
      }
      const u = poly.u[i] + ((poly.u[j] - poly.u[i]) * va) / (va - vb);
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
    }
    if (hi > lo) out.push([lo, hi]);
  }
  return out;
}

/** 1D union of the piece intervals on the line v = const, front (largest u) first. Overlapping layers count once. */
export function coveredIntervals(polys: readonly FlatPoly[], v: number): [number, number][] {
  const raw = rawIntervals(polys, v).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + JOIN_TOL) {
      if (iv[1] > last[1]) last[1] = iv[1];
    } else {
      merged.push([iv[0], iv[1]]);
    }
  }
  return merged.filter((iv) => iv[1] - iv[0] >= MIN_CHORD).reverse();
}

/** Largest number of pieces stacked on any point of the line v = const. */
export function maxOverlap(polys: readonly FlatPoly[], v: number): number {
  const events: [number, number][] = [];
  for (const [lo, hi] of rawIntervals(polys, v)) {
    // Shrink a little so that pieces which only share an edge do not count as stacked.
    if (hi - lo <= 4 * JOIN_TOL) continue;
    events.push([lo + JOIN_TOL, 1], [hi - JOIN_TOL, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let depth = 0;
  let best = 0;
  for (const [, step] of events) {
    depth += step;
    if (depth > best) best = depth;
  }
  return best;
}

/** One spanwise strip of a panel and the chordwise intervals the paper covers on its mid-line. */
export interface Strip {
  /** Index of the strip within its panel. */
  index: number;
  vMid: number;
  width: number;
  /** [aft u, fore u], front interval first. */
  intervals: [number, number][];
}

/** Slice a panel into `count` spanwise strips of equal width, sampled on their mid-lines. */
export function sliceStrips(shape: PanelShape, count: number): Strip[] {
  const extent = shape.vMax - shape.vMin;
  if (!(extent > 0) || count < 1) return [];
  const width = extent / count;
  const strips: Strip[] = [];
  for (let i = 0; i < count; i++) {
    const vMid = shape.vMin + (i + 0.5) * width;
    const intervals = coveredIntervals(shape.polys, vMid);
    if (intervals.length > 0) strips.push({ index: i, vMid, width, intervals });
  }
  return strips;
}

/** Thickest stack of the panel, from `lines` evenly spaced sample lines. */
export function panelMaxLayers(shape: PanelShape, lines: number): number {
  const extent = shape.vMax - shape.vMin;
  if (!(extent > 0)) return 0;
  let best = 0;
  for (let i = 0; i < lines; i++) {
    best = Math.max(best, maxOverlap(shape.polys, shape.vMin + ((i + 0.5) * extent) / lines));
  }
  return best;
}
