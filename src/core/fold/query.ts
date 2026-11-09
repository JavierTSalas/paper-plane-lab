import { piecePolygon } from './flat';
import { applyIso, centroid, containsPoint, EPS, MIN_FEATURE, mirrorPoint, spanAtY } from './geom';
import type { Segment } from './geom';
import type { FlatState, Vec2 } from '../types';

/** Default symmetry tolerance, metres. */
const SYMMETRY_TOL = 1e-6;
/** Snap points closer together than this are one point, metres. */
const SNAP_MERGE = 1e-6;

type Interval = [number, number];

/** Covered stretches of the horizontal line at height y, merged and sorted. */
function coverage(tables: readonly Vec2[][], y: number, tol: number): Interval[] {
  const spans = tables.flatMap((poly) => {
    const span = spanAtY(poly, y);
    return span ? [span] : [];
  });
  spans.sort((p, q) => p[0] - q[0]);
  const merged: Interval[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + tol) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged;
}

function sameCoverage(left: readonly Interval[], right: readonly Interval[], tol: number): boolean {
  return left.length === right.length && left.every((s, i) => Math.abs(s[0] - right[i][0]) <= tol && Math.abs(s[1] - right[i][1]) <= tol);
}

/**
 * True when the outline of the flat model (the union of its pieces, whatever their stacking)
 * is mirror-symmetric about the centreline x = paper.width / 2.
 * Checked two ways: every vertex and centroid, mirrored, must land on paper; and on a horizontal line
 * through the middle of every band between vertex heights the covered stretches must mirror each other.
 */
export function isSymmetric(state: FlatState, tol = SYMMETRY_TOL): boolean {
  const cx = state.paper.width / 2;
  const tables = state.pieces.map(piecePolygon);
  const covered = (p: Vec2): boolean => tables.some((poly) => containsPoint(poly, p, tol));
  for (const poly of tables) {
    if (!covered(mirrorPoint(centroid(poly), cx))) return false;
    if (!poly.every((v) => covered(mirrorPoint(v, cx)))) return false;
  }
  const levels = [...new Set(tables.flatMap((poly) => poly.map((v) => v[1])))].sort((p, q) => p - q);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] < 4 * tol) continue;
    const spans = coverage(tables, (levels[i] + levels[i - 1]) / 2, tol);
    const mirrored = spans.map(([lo, hi]): Interval => [2 * cx - hi, 2 * cx - lo]).reverse();
    // An edge at angle a to the scan line moves a stretch end by tol / sin(a); allow for shallow edges.
    if (!sameCoverage(spans, mirrored, 8 * tol)) return false;
  }
  return true;
}

/** The part of a sheet segment inside a convex counter-clockwise sheet polygon. */
function clipToPolygon(seg: Segment, poly: readonly Vec2[]): Segment | null {
  const [a, b] = seg;
  let t0 = 0;
  let t1 = 1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ex = poly[i][0] - poly[j][0];
    const ey = poly[i][1] - poly[j][1];
    const len = Math.hypot(ex, ey);
    const da = (ex * (a[1] - poly[j][1]) - ey * (a[0] - poly[j][0])) / len;
    const db = (ex * (b[1] - poly[j][1]) - ey * (b[0] - poly[j][0])) / len;
    if (da < -EPS && db < -EPS) return null;
    if (da < -EPS) t0 = Math.max(t0, da / (da - db));
    else if (db < -EPS) t1 = Math.min(t1, da / (da - db));
  }
  if (t1 <= t0) return null;
  const at = (t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const clipped: Segment = [at(t0), at(t1)];
  return Math.hypot(clipped[1][0] - clipped[0][0], clipped[1][1] - clipped[0][1]) > MIN_FEATURE ? clipped : null;
}

/** Crossing point of two segments, when they cross at an angle. */
function crossing(p: Segment, q: Segment): Vec2 | null {
  const rx = p[1][0] - p[0][0];
  const ry = p[1][1] - p[0][1];
  const sx = q[1][0] - q[0][0];
  const sy = q[1][1] - q[0][1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return null;
  const wx = q[0][0] - p[0][0];
  const wy = q[0][1] - p[0][1];
  const t = (wx * sy - wy * sx) / denom;
  const u = (wx * ry - wy * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [p[0][0] + rx * t, p[0][1] + ry * t] : null;
}

/**
 * Points worth snapping to, table frame: the corners and edge midpoints of every piece, and the ends
 * and crossings of reference creases. Points hidden under a higher layer are left out, duplicates merged.
 */
export function snapPoints(state: FlatState): Vec2[] {
  const tables = state.pieces.map(piecePolygon);
  const aux = state.creases.filter((c) => c.assignment === 'aux');
  const found: Array<{ p: Vec2; layer: number }> = [];
  state.pieces.forEach((piece, i) => {
    const poly = tables[i];
    const add = (p: Vec2): void => {
      found.push({ p, layer: piece.layer });
    };
    poly.forEach((v, k) => {
      const next = poly[(k + 1) % poly.length];
      add(v);
      add([(v[0] + next[0]) / 2, (v[1] + next[1]) / 2]);
    });
    const marks = aux.flatMap((c) => {
      const inside = clipToPolygon([c.a, c.b], piece.sheet);
      return inside ? [inside] : [];
    });
    marks.forEach((mark, k) => {
      add(applyIso(piece.iso, mark[0]));
      add(applyIso(piece.iso, mark[1]));
      for (let m = 0; m < k; m++) {
        const x = crossing(mark, marks[m]);
        if (x) add(applyIso(piece.iso, x));
      }
    });
  });

  const cell = (v: number): number => Math.round(v / SNAP_MERGE);
  const seen = new Set<string>();
  const out: Vec2[] = [];
  for (const { p, layer } of found) {
    const hidden = state.pieces.some((other, i) => other.layer > layer && containsPoint(tables[i], p, -MIN_FEATURE));
    if (hidden) continue;
    const key = `${cell(p[0])},${cell(p[1])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
