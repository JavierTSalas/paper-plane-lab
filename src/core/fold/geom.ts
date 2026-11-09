import type { FoldLine, Iso2, Vec2 } from '../types';

/** Side-test tolerance, metres: a point closer than this to a line lies on it. */
export const EPS = 1e-9;
/** A cut that would land closer than this to an existing vertex goes through that vertex instead, metres. */
export const WELD = 3e-8;
/** A cut that would leave a part smaller than this is not made, m². */
export const SLIVER_AREA = 1e-12;
/** Shared edges and creases shorter than this are ignored, metres. */
export const MIN_FEATURE = 1e-7;
/** Two segments within this distance of one line are collinear, metres. */
export const COLLINEAR_TOL = 1e-8;
/** Two layers overlap when they penetrate each other by more than this, metres. */
export const OVERLAP_DEPTH = 1e-6;

export type Segment = readonly [Vec2, Vec2];

/** A directed line: a point on it and a unit direction. */
export interface Line {
  p: Vec2;
  u: Vec2;
}

export const isPoint = (p: unknown): p is Vec2 =>
  Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Null when the two points are missing, not finite, or coincide. */
export function toLine(line: FoldLine | null | undefined): Line | null {
  const a = line?.a;
  const b = line?.b;
  if (!isPoint(a) || !isPoint(b)) return null;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return len > EPS && Number.isFinite(len) ? { p: a, u: [dx / len, dy / len] } : null;
}

/** Signed distance of q from the line. Positive on the left of the direction. */
export const lineDistance = (line: Line, q: Vec2): number =>
  line.u[0] * (q[1] - line.p[1]) - line.u[1] * (q[0] - line.p[0]);

/* ---------------------------- isometries ---------------------------- */

export const ISO_IDENTITY: Iso2 = [1, 0, 0, 1, 0, 0];

export const applyIso = (m: Iso2, p: Vec2): Vec2 => [
  m[0] * p[0] + m[1] * p[1] + m[4],
  m[2] * p[0] + m[3] * p[1] + m[5],
];

/** m after n. */
export const composeIso = (m: Iso2, n: Iso2): Iso2 => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[0] * n[4] + m[1] * n[5] + m[4],
  m[2] * n[4] + m[3] * n[5] + m[5],
];

export function reflectionIso(line: Line): Iso2 {
  const [ux, uy] = line.u;
  const a = 2 * ux * ux - 1;
  const b = 2 * ux * uy;
  const d = 2 * uy * uy - 1;
  const [px, py] = line.p;
  return [a, b, b, d, px - (a * px + b * py), py - (b * px + d * py)];
}

/** Mirror about the vertical line x = cx. */
export const mirrorIso = (cx: number): Iso2 => [-1, 0, 0, 1, 2 * cx, 0];

export const mirrorPoint = (p: Vec2, cx: number): Vec2 => [2 * cx - p[0], p[1]];

/* ---------------------------- convex polygons ---------------------------- */

/** Positive for counter-clockwise polygons. */
export function signedArea(poly: readonly Vec2[]): number {
  const [ox, oy] = poly[0];
  let twice = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    twice += (poly[i][0] - ox) * (poly[i + 1][1] - oy) - (poly[i + 1][0] - ox) * (poly[i][1] - oy);
  }
  return twice / 2;
}

export function centroid(poly: readonly Vec2[]): Vec2 {
  const [ox, oy] = poly[0];
  let twice = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const ax = poly[i][0] - ox;
    const ay = poly[i][1] - oy;
    const bx = poly[i + 1][0] - ox;
    const by = poly[i + 1][1] - oy;
    const w = ax * by - bx * ay;
    twice += w;
    sx += w * (ax + bx);
    sy += w * (ay + by);
  }
  return twice === 0 ? poly[0] : [ox + sx / (3 * twice), oy + sy / (3 * twice)];
}

/**
 * True when q is inside the polygon or within `tol` outside it (either winding).
 * A negative `tol` asks for a point at least that deep inside.
 */
export function containsPoint(poly: readonly Vec2[], q: Vec2, tol: number): boolean {
  const sign = signedArea(poly) < 0 ? -1 : 1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ex = poly[i][0] - poly[j][0];
    const ey = poly[i][1] - poly[j][1];
    const inward = sign * (ex * (q[1] - poly[j][1]) - ey * (q[0] - poly[j][0]));
    if (inward < -tol * Math.hypot(ex, ey)) return false;
  }
  return true;
}

function separatedBy(p: readonly Vec2[], q: readonly Vec2[], depth: number): boolean {
  const sign = signedArea(p) < 0 ? -1 : 1;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const ex = p[i][0] - p[j][0];
    const ey = p[i][1] - p[j][1];
    const limit = depth * Math.hypot(ex, ey);
    if (q.every((v) => sign * (ex * (v[1] - p[j][1]) - ey * (v[0] - p[j][0])) <= limit)) return true;
  }
  return false;
}

/** True when two convex polygons (either winding) penetrate each other by more than `depth`. */
export const overlaps = (p: readonly Vec2[], q: readonly Vec2[], depth = OVERLAP_DEPTH): boolean =>
  !separatedBy(p, q, depth) && !separatedBy(q, p, depth);

/** x-extent of a convex polygon along the horizontal line at height y, or null. */
export function spanAtY(poly: readonly Vec2[], y: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const y0 = poly[j][1] - y;
    const y1 = poly[i][1] - y;
    if (y0 < 0 === y1 < 0) continue;
    const x = poly[j][0] + ((poly[i][0] - poly[j][0]) * y0) / (y0 - y1);
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return hi > lo ? [lo, hi] : null;
}

/** The stretch two segments share when they lie on one line, or null. */
export function collinearOverlap(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Segment | null {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey);
  if (len < MIN_FEATURE) return null;
  const ux = ex / len;
  const uy = ey / len;
  if (Math.abs(ux * (c[1] - a[1]) - uy * (c[0] - a[0])) > COLLINEAR_TOL) return null;
  if (Math.abs(ux * (d[1] - a[1]) - uy * (d[0] - a[0])) > COLLINEAR_TOL) return null;
  const tc = ux * (c[0] - a[0]) + uy * (c[1] - a[1]);
  const td = ux * (d[0] - a[0]) + uy * (d[1] - a[1]);
  const lo = Math.max(0, Math.min(tc, td));
  const hi = Math.min(len, Math.max(tc, td));
  if (hi - lo < MIN_FEATURE) return null;
  return [
    [a[0] + ux * lo, a[1] + uy * lo],
    [a[0] + ux * hi, a[1] + uy * hi],
  ];
}

/** Every stretch of boundary two polygons have in common. */
export function sharedEdges(p: readonly Vec2[], q: readonly Vec2[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    for (let k = 0, l = q.length - 1; k < q.length; l = k++) {
      const seg = collinearOverlap(p[j], p[i], q[l], q[k]);
      if (seg) out.push(seg);
    }
  }
  return out;
}

/* ---------------------------- splitting ---------------------------- */

export interface Split {
  /** Part on the left of the line (positive distance), or null. Whole polygons are returned by reference. */
  pos: Vec2[] | null;
  /** Part on the right of the line, or null. */
  neg: Vec2[] | null;
  /** The two ends of the cut when both parts exist. */
  cut: Segment | null;
  /** The line clipped off less than SLIVER_AREA: the polygon was left whole on its larger side. */
  sliver: boolean;
  /** The line cuts the polygon or passes through its boundary. */
  touches: boolean;
}

const whole = (poly: Vec2[], positive: boolean, touches: boolean, sliver = false): Split => ({
  pos: positive ? poly : null,
  neg: positive ? null : poly,
  cut: null,
  sliver,
  touches,
});

/** Side of the vertex farthest from the line. */
function dominantSide(dist: readonly number[]): boolean {
  let far = 0;
  for (const d of dist) if (Math.abs(d) > Math.abs(far)) far = d;
  return far >= 0;
}

/**
 * Cut a convex polygon by a line, given the signed distance of every vertex from that line.
 * Both parts keep the winding of the input, and together they tile it exactly.
 */
export function splitConvex(poly: Vec2[], dist: readonly number[]): Split {
  const n = poly.length;
  const cls = dist.map((d) => (d > EPS ? 1 : d < -EPS ? -1 : 0));
  if (!cls.includes(1) || !cls.includes(-1)) return whole(poly, cls.includes(1), cls.includes(0));

  // A cut that would land within WELD of a vertex goes through the vertex instead.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (cls[i] * cls[j] >= 0) continue;
    const t = dist[i] / (dist[i] - dist[j]);
    const len = Math.hypot(poly[j][0] - poly[i][0], poly[j][1] - poly[i][1]);
    if (t * len < WELD) cls[i] = 0;
    else if ((1 - t) * len < WELD) cls[j] = 0;
  }
  // A vertex on the line between two neighbours of one side is a graze, not a crossing.
  for (let i = 0; i < n; i++) {
    const prev = cls[(i + n - 1) % n];
    if (cls[i] === 0 && prev !== 0 && prev === cls[(i + 1) % n]) cls[i] = prev;
  }
  if (!cls.includes(1) || !cls.includes(-1)) return whole(poly, cls.includes(1), true);

  const pos: Vec2[] = [];
  const neg: Vec2[] = [];
  const ends: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p = poly[i];
    if (cls[i] >= 0) pos.push(p);
    if (cls[i] <= 0) neg.push(p);
    if (cls[i] === 0) ends.push(p);
    if (cls[i] * cls[j] < 0) {
      const t = dist[i] / (dist[i] - dist[j]);
      const x: Vec2 = [p[0] + (poly[j][0] - p[0]) * t, p[1] + (poly[j][1] - p[1]) * t];
      pos.push(x);
      neg.push(x);
      ends.push(x);
    }
  }
  if (ends.length !== 2 || pos.length < 3 || neg.length < 3) return whole(poly, dominantSide(dist), true, true);
  const areaPos = Math.abs(signedArea(pos));
  const areaNeg = Math.abs(signedArea(neg));
  if (Math.min(areaPos, areaNeg) < SLIVER_AREA) return whole(poly, areaPos >= areaNeg, true, true);
  return { pos, neg, cut: [ends[0], ends[1]], sliver: false, touches: true };
}

/** Cut a sheet polygon by a table-frame line, given the polygon's sheet -> table isometry. */
export const splitByLine = (sheet: Vec2[], iso: Iso2, line: Line): Split =>
  splitConvex(
    sheet,
    sheet.map((v) => lineDistance(line, applyIso(iso, v))),
  );

/* ---------------------------- misc ---------------------------- */

export interface Bounds {
  min: Vec2;
  max: Vec2;
}

export function boundsOf(polys: Iterable<readonly Vec2[]>): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { min: [x0, y0], max: [x1, y1] };
}

/** True when two boxes overlap or come within `slack` of each other. */
export const boxesMeet = (p: Bounds, q: Bounds, slack: number): boolean =>
  p.min[0] <= q.max[0] + slack && q.min[0] <= p.max[0] + slack && p.min[1] <= q.max[1] + slack && q.min[1] <= p.max[1] + slack;

/** Disjoint-set forest over the indices 0..n-1. */
export function unionFind(n: number): { find(i: number): number; union(i: number, j: number): void } {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  return {
    find,
    union: (i, j) => {
      parent[find(i)] = find(j);
    },
  };
}
