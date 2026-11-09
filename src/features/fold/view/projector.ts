import type { Vec2, Vec3 } from '../../../core/types';

/**
 * Orthographic camera over a z-up world (the desk frame: x right, y away from the viewer, z up).
 * `pitch` is the elevation of the viewing direction above the desk, degrees: 90 looks straight down.
 * `yaw` turns the camera about +z, degrees: 0 stands at -y looking toward +y.
 * Screen space is SVG space: x right, y down, in user units; `scale` is units per metre.
 */
export interface Camera {
  yaw: number;
  pitch: number;
  scale: number;
  /** Screen position of the world origin. */
  cx: number;
  cy: number;
}

export interface CameraBasis {
  /** World direction of screen right. */
  r: Vec3;
  /** World direction of screen up. */
  u: Vec3;
  /** World direction toward the camera. */
  w: Vec3;
}

const DEG = Math.PI / 180;

export function cameraBasis(yawDeg: number, pitchDeg: number): CameraBasis {
  const cy = Math.cos(yawDeg * DEG);
  const sy = Math.sin(yawDeg * DEG);
  const cp = Math.cos(pitchDeg * DEG);
  const sp = Math.sin(pitchDeg * DEG);
  // Yaw 0: r = +x, w = (0, -cos p, sin p); then everything is turned about +z by yaw.
  const r: Vec3 = [cy, sy, 0];
  const w: Vec3 = [sy * cp, -cy * cp, sp];
  // u = w x r
  const u: Vec3 = [w[1] * r[2] - w[2] * r[1], w[2] * r[0] - w[0] * r[2], w[0] * r[1] - w[1] * r[0]];
  return { r, u, w };
}

/** A camera from tilt (degrees away from straight down), the convention PaperCanvas exposes. */
export const pitchFromTilt = (tiltDeg: number): number => 90 - tiltDeg;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** World point to [screen x, screen y, depth]. Larger depth is nearer to the camera. */
export function projectWith(basis: CameraBasis, cam: Camera, p: Vec3): Vec3 {
  return [cam.cx + cam.scale * dot(p, basis.r), cam.cy - cam.scale * dot(p, basis.u), dot(p, basis.w)];
}

export function project(cam: Camera, p: Vec3): Vec3 {
  return projectWith(cameraBasis(cam.yaw, cam.pitch), cam, p);
}

/**
 * Screen point back to the world plane z = h. Exact for any camera that is not level with the desk.
 * Returns null when the camera looks along the plane.
 */
export function unprojectToPlane(cam: Camera, sx: number, sy: number, h = 0): Vec3 | null {
  const { r, u, w } = cameraBasis(cam.yaw, cam.pitch);
  const a = (sx - cam.cx) / cam.scale;
  const b = -(sy - cam.cy) / cam.scale;
  // p = a r + b u + t w, with p.z = h
  if (Math.abs(w[2]) < 1e-9) return null;
  const t = (h - a * r[2] - b * u[2]) / w[2];
  return [a * r[0] + b * u[0] + t * w[0], a * r[1] + b * u[1] + t * w[1], h];
}

export interface ViewBox {
  width: number;
  height: number;
  /** Margin kept free on every side, user units. */
  pad?: number;
}

export interface ScreenBounds {
  min: Vec2;
  max: Vec2;
}

/** Bounds of the points on a unit-scale screen (camera at scale 1, centre 0). */
export function screenBounds(points: readonly Vec3[], yaw: number, pitch: number): ScreenBounds | null {
  if (points.length === 0) return null;
  const { r, u } = cameraBasis(yaw, pitch);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    const x = dot(p, r);
    const y = -dot(p, u);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { min: [x0, y0], max: [x1, y1] };
}

/** The camera with the given orientation that centres the bounds in the box at the largest scale that fits. */
export function fitBounds(b: ScreenBounds, yaw: number, pitch: number, box: ViewBox, maxScale = Infinity): Camera {
  const pad = box.pad ?? 0;
  const w = Math.max(b.max[0] - b.min[0], 1e-9);
  const h = Math.max(b.max[1] - b.min[1], 1e-9);
  const scale = Math.min((box.width - 2 * pad) / w, (box.height - 2 * pad) / h, maxScale);
  const mx = (b.min[0] + b.max[0]) / 2;
  const my = (b.min[1] + b.max[1]) / 2;
  return { yaw, pitch, scale, cx: box.width / 2 - mx * scale, cy: box.height / 2 - my * scale };
}

/** Fit a point set into a view box. Null for an empty set. */
export function fitPoints(points: readonly Vec3[], yaw: number, pitch: number, box: ViewBox, maxScale?: number): Camera | null {
  const b = screenBounds(points, yaw, pitch);
  return b ? fitBounds(b, yaw, pitch, box, maxScale) : null;
}

export function unionBounds(a: ScreenBounds | null, b: ScreenBounds | null): ScreenBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1])],
  };
}

/* ------------------------------------------------------------------ geometry helpers */

/** Unit normal of a planar polygon by Newell's method; right-handed with the vertex order. [0,0,0] if degenerate. */
export function polygonNormal(verts: readonly Vec3[]): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % n]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz);
  return l > 0 ? [nx / l, ny / l, nz / l] : [0, 0, 0];
}

/**
 * The 2D affine map [a b c d e f] (SVG matrix) taking sheet points to screen points for a planar piece,
 * from its first non-collinear vertex triple. Null when the piece is seen edge-on or degenerate.
 */
export function sheetToScreen(sheet: readonly Vec2[], screen: readonly Vec3[]): [number, number, number, number, number, number] | null {
  const n = Math.min(sheet.length, screen.length);
  if (n < 3) return null;
  const s0 = sheet[0]!;
  const p0 = screen[0]!;
  let best = 0;
  let bi = 1;
  let bj = 2;
  // Pick the pair spanning the largest sheet area for numerical stability.
  for (let i = 1; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = Math.abs((sheet[i]![0] - s0[0]) * (sheet[j]![1] - s0[1]) - (sheet[i]![1] - s0[1]) * (sheet[j]![0] - s0[0]));
      if (a > best) {
        best = a;
        bi = i;
        bj = j;
      }
    }
  }
  if (best < 1e-14) return null;
  const u1x = sheet[bi]![0] - s0[0];
  const u1y = sheet[bi]![1] - s0[1];
  const u2x = sheet[bj]![0] - s0[0];
  const u2y = sheet[bj]![1] - s0[1];
  const v1x = screen[bi]![0] - p0[0];
  const v1y = screen[bi]![1] - p0[1];
  const v2x = screen[bj]![0] - p0[0];
  const v2y = screen[bj]![1] - p0[1];
  const det = u1x * u2y - u2x * u1y;
  // M [u1 u2] = [v1 v2]  =>  M = [v1 v2] [u1 u2]^-1
  const a = (v1x * u2y - v2x * u1y) / det;
  const c = (v2x * u1x - v1x * u2x) / det;
  const b = (v1y * u2y - v2y * u1y) / det;
  const d = (v2y * u1x - v1y * u2x) / det;
  // The screen image is a line when the piece is edge-on; such a matrix is singular.
  if (Math.abs(a * d - b * c) < 1e-9 * (Math.abs(a * d) + Math.abs(b * c) + 1e-12)) return null;
  const e = p0[0] - a * s0[0] - c * s0[1];
  const f = p0[1] - b * s0[0] - d * s0[1];
  return [a, b, c, d, e, f];
}

/* ------------------------------------------------------------------ painter ordering */

/** A face to order. All vectors are world frame. */
export interface DepthFace {
  verts: readonly Vec3[];
  /** Rigid stack the face belongs to (a flap, a panel). Faces of one group are ordered by rank alone. */
  group: number;
  /** Stacking rank inside the group: 0 is the bottom layer. */
  rank: number;
  /** Direction in which rank grows, world frame. */
  stackDir: Vec3;
  /**
   * Optional hard draw level: when two overlapping faces both have one and they differ, the lower level
   * draws first. Used for a flap swinging over (valley) or under (mountain) the stationary stack.
   */
  level?: number;
}

/** Depth bias per rank step, metres, used only to break ties between faces of different groups. */
const RANK_BIAS = 1e-5;
const PLANE_EPS = 1e-7;

interface Prepared {
  sx: number[];
  sy: number[];
  depth: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  n: Vec3;
  /** dot(n, w); |nw| ~ 0 = edge-on. */
  nw: number;
  d: number;
}

function prepare(f: DepthFace, basis: CameraBasis): Prepared {
  const sx: number[] = [];
  const sy: number[] = [];
  let depth = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of f.verts) {
    const x = dot(p, basis.r);
    const y = dot(p, basis.u);
    sx.push(x);
    sy.push(y);
    depth += dot(p, basis.w);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  depth /= Math.max(1, f.verts.length);
  const n = polygonNormal(f.verts);
  const p0 = f.verts[0] ?? [0, 0, 0];
  const s = Math.sign(dot(f.stackDir, basis.w)) || 1;
  return { sx, sy, depth: depth + s * f.rank * RANK_BIAS, x0, x1, y0, y1, n, nw: dot(n, basis.w), d: dot(n, p0) };
}

/** Strict overlap of two convex polygons in screen space (separating axis test). */
function overlaps(a: Prepared, b: Prepared, eps: number): boolean {
  if (a.x1 <= b.x0 + eps || b.x1 <= a.x0 + eps || a.y1 <= b.y0 + eps || b.y1 <= a.y0 + eps) return false;
  return !separated(a, b, eps) && !separated(b, a, eps);
}

function separated(a: Prepared, b: Prepared, eps: number): boolean {
  const n = a.sx.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = -(a.sy[j]! - a.sy[i]!);
    const ay = a.sx[j]! - a.sx[i]!;
    const l = Math.hypot(ax, ay);
    if (l < 1e-12) continue;
    let amin = Infinity;
    let amax = -Infinity;
    for (let k = 0; k < n; k++) {
      const v = (a.sx[k]! * ax + a.sy[k]! * ay) / l;
      if (v < amin) amin = v;
      if (v > amax) amax = v;
    }
    let bmin = Infinity;
    let bmax = -Infinity;
    for (let k = 0; k < b.sx.length; k++) {
      const v = (b.sx[k]! * ax + b.sy[k]! * ay) / l;
      if (v < bmin) bmin = v;
      if (v > bmax) bmax = v;
    }
    if (amax <= bmin + eps || bmax <= amin + eps) return true;
  }
  return false;
}

/** Side of every vertex of `f` relative to the plane of `p`, measured toward the camera: +1 all in front, -1 all behind, 0 mixed. */
function sideOf(f: DepthFace, p: Prepared): number {
  if (Math.abs(p.nw) < 1e-6) return 0;
  const toCam = Math.sign(p.nw);
  let front = true;
  let behind = true;
  for (const v of f.verts) {
    const s = (dot(p.n, v) - p.d) * toCam;
    if (s < -PLANE_EPS) front = false;
    if (s > PLANE_EPS) behind = false;
  }
  if (front && behind) return 2; // coplanar
  return front ? 1 : behind ? -1 : 0;
}

/**
 * Painter's order: indices of `faces`, far to near. Overlapping faces are ordered by, in turn,
 * their draw level, their rank in a shared rigid stack (bottom to top as seen from the camera), and
 * Newell's plane tests. Everything else, and any cycle, falls back to mean depth plus a small rank bias.
 */
export function painterOrder(faces: readonly DepthFace[], cam: Pick<Camera, 'yaw' | 'pitch'>): number[] {
  const basis = cameraBasis(cam.yaw, cam.pitch);
  const n = faces.length;
  const prep = faces.map((f) => prepare(f, basis));
  // Screen overlap epsilon relative to the scene size, so touching neighbours do not constrain each other.
  let span = 0;
  for (const p of prep) span = Math.max(span, p.x1 - p.x0, p.y1 - p.y0);
  const eps = span * 1e-6;
  const after: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  const edge = (from: number, to: number): void => {
    after[from]!.push(to);
    indeg[to]!++;
  };
  for (let i = 0; i < n; i++) {
    const fi = faces[i]!;
    const pi = prep[i]!;
    for (let j = i + 1; j < n; j++) {
      const fj = faces[j]!;
      const pj = prep[j]!;
      if (!overlaps(pi, pj, eps)) continue;
      if (fi.level !== undefined && fj.level !== undefined && fi.level !== fj.level) {
        if (fi.level < fj.level) edge(i, j);
        else edge(j, i);
        continue;
      }
      if (fi.group === fj.group) {
        if (fi.rank === fj.rank) continue;
        const up = dot(fi.stackDir, basis.w) >= 0;
        if (fi.rank < fj.rank === up) edge(i, j);
        else edge(j, i);
        continue;
      }
      const jVsI = sideOf(fj, pi);
      const iVsJ = sideOf(fi, pj);
      const iFirst = jVsI === 1 || iVsJ === -1;
      const jFirst = iVsJ === 1 || jVsI === -1;
      if (jVsI === 2 || iVsJ === 2) continue;
      if (iFirst && !jFirst) edge(i, j);
      else if (jFirst && !iFirst) edge(j, i);
    }
  }
  // Kahn's algorithm, always taking the farthest ready face; a cycle releases the farthest remaining face.
  const out: number[] = [];
  const done = new Array<boolean>(n).fill(false);
  for (let k = 0; k < n; k++) {
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || indeg[i]! > 0) continue;
      if (pick < 0 || prep[i]!.depth < prep[pick]!.depth) pick = i;
    }
    if (pick < 0) {
      for (let i = 0; i < n; i++) {
        if (done[i]) continue;
        if (pick < 0 || prep[i]!.depth < prep[pick]!.depth) pick = i;
      }
    }
    done[pick] = true;
    out.push(pick);
    for (const t of after[pick]!) indeg[t]!--;
  }
  return out;
}

/* ------------------------------------------------------------------ shading */

/** Soft key light from the upper left, slightly toward the viewer (desk frame). */
export const LIGHT: Vec3 = (() => {
  const v: Vec3 = [-0.45, -0.35, 0.82];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/**
 * Brightness factor for a face: 1 for a face square to the light, never below `ambient`.
 * `normal` may point either way; the face side that the camera sees is the lit one.
 */
export function shadeFactor(normal: Vec3, toCamera: Vec3, light: Vec3 = LIGHT, ambient = 0.72): number {
  const s = Math.sign(dot(normal, toCamera)) || 1;
  const lambert = Math.max(0, s * dot(normal, light));
  return ambient + (1 - ambient) * lambert;
}

/** Point where a ray along the light direction through p meets the desk z = 0. */
export function shadowOnDesk(p: Vec3, light: Vec3 = LIGHT): Vec3 {
  const t = p[2] / Math.max(light[2], 1e-3);
  return [p[0] - light[0] * t, p[1] - light[1] * t, 0];
}
