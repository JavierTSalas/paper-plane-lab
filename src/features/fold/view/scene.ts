import { frameAt, piecePolygon } from '../../../core/fold';
import type { AnimPiece } from '../../../core/fold';
import type { Crease, FlatPiece, FlatState, FoldLine, Iso2, PosedModel, StepFrame, Vec2, Vec3 } from '../../../core/types';
import {
  cameraBasis, painterOrder, polygonNormal, projectWith, shadeFactor, shadowOnDesk, sheetToScreen, type Camera, type DepthFace,
} from './projector';

/**
 * One convex piece of paper in the world (desk) frame: x right, y away from the viewer, z up, metres.
 * `sheet[i]` is the sheet point of `verts[i]`; the sheet polygon is counter-clockwise seen from the front.
 */
export interface SceneFace extends DepthFace {
  key: number;
  verts: Vec3[];
  sheet: readonly Vec2[];
}

/** Display gap between stacked layers, metres. Real paper is 0.1 mm; this is exaggerated a little so stacks read. */
export const LAYER_GAP = 0.0006;

const add3 = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const neg3 = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
const UP: Vec3 = [0, 0, 1];

/** A flat-folded state lying on the desk, bottom layer at z = 0. */
export function facesFromFlat(state: FlatState, gap = LAYER_GAP): SceneFace[] {
  return state.pieces.map((p) => ({
    key: p.id,
    verts: piecePolygon(p).map(([x, y]): Vec3 => [x, y, p.layer * gap]),
    sheet: p.sheet,
    group: 0,
    rank: p.layer,
    stackDir: UP,
  }));
}

/**
 * The image of the table's +z under a piece's rigid motion, from its front normal and whether its back
 * faces +z (`flipped`): n_front = flipped ? -R z : R z.
 */
const stackDirOf = (verts: readonly Vec3[], flipped: boolean): Vec3 => {
  const n = polygonNormal(verts);
  return flipped ? neg3(n) : n;
};

/**
 * One instant of a fold step. Pieces that swing form one rigid group ordered by their old layers, drawn
 * above the stationary stack for a valley fold and below it for a mountain fold; a flip turns everything as one group.
 */
export function facesFromFrame(frame: StepFrame, t: number, gap = LAYER_GAP): SceneFace[] {
  const anim = frameAt(frame, t, gap);
  const source = frame.step.kind === 'flip' ? frame.before.pieces : frame.split;
  const byId = new Map<number, FlatPiece>(source.map((p) => [p.id, p]));
  const flip = frame.step.kind === 'flip';
  return anim.map((a, i) => {
    const piece = byId.get(a.id);
    const layer = piece?.layer ?? i;
    const moving = flip || a.moving;
    return {
      key: a.id,
      verts: a.verts,
      sheet: a.sheet,
      group: moving ? 1 : 0,
      rank: layer,
      stackDir: moving ? stackDirOf(a.verts, piece?.flipped ?? false) : UP,
      level: flip ? undefined : moving ? frame.sense : 0,
    };
  });
}

/**
 * Bare animation pieces (no step at hand). Stationary pieces stack by array order (bottom first). A piece's
 * original side cannot be recovered from `frontUp` alone, so swinging pieces are ordered among themselves
 * by plane tests, not by a rigid stack; prefer facesFromFrame when the step is known.
 */
export function facesFromAnim(pieces: readonly AnimPiece[]): SceneFace[] {
  let movingZ = 0;
  let staticZ = 0;
  let nm = 0;
  let ns = 0;
  for (const p of pieces) {
    for (const v of p.verts) {
      if (p.moving) {
        movingZ += v[2];
        nm++;
      } else {
        staticZ += v[2];
        ns++;
      }
    }
  }
  const movingLevel = nm > 0 && ns > 0 && movingZ / nm < staticZ / ns ? -1 : 1;
  return pieces.map((p, i) => ({
    key: p.id,
    verts: p.verts,
    sheet: p.sheet,
    group: p.moving ? 1 + i : 0,
    rank: i,
    stackDir: UP,
    level: p.moving ? movingLevel : 0,
  }));
}

/** Body frame (x nose, y up, z right) to the desk frame (x right, y nose, z up): a proper rotation. */
export const bodyToDesk = (p: Vec3): Vec3 => [p[2], p[0], p[1]];

export interface ModelFaceOptions {
  gap?: number;
  /** Added to every desk point after mapping. */
  offset?: Vec3;
  /** Mirror the body z axis (desk x) as well; used to put a mountain-keel model on the desk the way it was folded. */
  mirror?: boolean;
}

/**
 * A posed 3D model in the desk frame. Layers are offset along each panel's stacking direction so that the
 * top layer lies on the posed surface and lower layers stand off outward (the outside of a closed keel).
 */
export function facesFromModel(model: PosedModel, opts: ModelFaceOptions = {}): SceneFace[] {
  const gap = opts.gap ?? LAYER_GAP;
  const off = opts.offset ?? [0, 0, 0];
  let maxLayer = 0;
  for (const p of model.pieces) maxLayer = Math.max(maxLayer, p.layer);
  const map = (v: Vec3): Vec3 => {
    const d = bodyToDesk(v);
    return [(opts.mirror ? -d[0] : d[0]) + off[0], d[1] + off[1], d[2] + off[2]];
  };
  return model.pieces.map((p) => {
    const panel = model.panels[p.panel];
    const sd = panel ? bodyToDesk(panel.stackDir) : UP;
    const stackDir: Vec3 = opts.mirror ? [-sd[0], sd[1], sd[2]] : sd;
    const shift = (p.layer - maxLayer) * gap;
    const verts = p.verts.map((v) => add3(map(v), stackDir, shift));
    // A mirror reverses the winding, so the sheet order must be reversed with it to keep front = right-handed.
    return {
      key: p.id,
      verts: opts.mirror ? [...verts].reverse() : verts,
      sheet: opts.mirror ? [...p.sheet].reverse() : p.sheet,
      group: 1000 + p.panel,
      rank: p.layer,
      stackDir,
    };
  });
}

/* ------------------------------------------------------------------ composition */

export type Affine = [number, number, number, number, number, number];

export interface DrawFace {
  key: number;
  sheet: readonly Vec2[];
  /** Sheet -> screen. Null when the face is edge-on. */
  matrix: Affine | null;
  /** Sheet -> screen of the face's shadow on the desk. */
  shadow: Affine | null;
  side: 'front' | 'back';
  shade: number;
}

export interface ComposeOptions {
  shadows?: boolean;
  /** Height of the surface that receives shadows, world z. */
  groundZ?: number;
}

/** Project, order (far to near) and shade faces for one camera. */
export function composeScene(faces: readonly SceneFace[], cam: Camera, opts: ComposeOptions = {}): DrawFace[] {
  const basis = cameraBasis(cam.yaw, cam.pitch);
  const order = painterOrder(faces, cam);
  const ground = opts.groundZ ?? 0;
  return order.map((i) => {
    const f = faces[i]!;
    const screen = f.verts.map((v) => projectWith(basis, cam, v));
    const n = polygonNormal(f.verts);
    const nw = n[0] * basis.w[0] + n[1] * basis.w[1] + n[2] * basis.w[2];
    let shadow: Affine | null = null;
    if (opts.shadows) {
      const sh = f.verts.map((v) => {
        const s = shadowOnDesk([v[0], v[1], v[2] - ground]);
        return projectWith(basis, cam, [s[0], s[1], ground]);
      });
      shadow = sheetToScreen(f.sheet, sh);
    }
    return {
      key: f.key,
      sheet: f.sheet,
      matrix: sheetToScreen(f.sheet, screen),
      shadow,
      side: nw >= 0 ? 'front' : 'back',
      shade: shadeFactor(n, basis.w),
    };
  });
}

/** SVG matrix that maps table points (x, y) at height h onto the screen. */
export function tableMatrix(cam: Camera, h = 0): Affine {
  const { r, u } = cameraBasis(cam.yaw, cam.pitch);
  const s = cam.scale;
  return [s * r[0], -s * u[0], s * r[1], -s * u[1], cam.cx + s * h * r[2], cam.cy - s * h * u[2]];
}

export const matrixAttr = (m: Affine): string => `matrix(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(7))).join(' ')})`;

export const polyPath = (pts: readonly Vec2[]): string =>
  pts.length ? `M${pts.map((p) => `${+p[0].toFixed(6)} ${+p[1].toFixed(6)}`).join('L')}Z` : '';

/* ------------------------------------------------------------------ colour */

function parseHex(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1]!;
  if (h.length === 3) return [0, 1, 2].map((i) => parseInt(h[i]! + h[i]!, 16)) as [number, number, number];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Warm shadow tone the paper darkens toward; keeps shading in the cozy palette instead of going grey. */
const SHADE_TONE: [number, number, number] = [74, 58, 40];
const shadeCache = new Map<string, string>();

/** A paper colour darkened by a shading factor in [0, 1]. Non-hex colours are returned unchanged. */
export function shadeColor(color: string, factor: number): string {
  const q = Math.round(factor * 100);
  const key = `${color}|${q}`;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const rgb = parseHex(color);
  if (!rgb) return color;
  const f = q / 100;
  const out = `rgb(${rgb.map((c, i) => Math.round(c * f + SHADE_TONE[i]! * (1 - f))).join(' ')})`;
  if (shadeCache.size > 2000) shadeCache.clear();
  shadeCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ creases and lines */

/** Clip a segment to a convex polygon (any winding). Null when nothing is left. */
export function clipSegment(a: Vec2, b: Vec2, poly: readonly Vec2[]): [Vec2, Vec2] | null {
  const n = poly.length;
  if (n < 3) return null;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  const ccw = area >= 0 ? 1 : -1;
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    // Inside: ccw * cross(q - p, x - p) >= 0
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const num = ccw * (ex * (a[1] - p[1]) - ey * (a[0] - p[0]));
    const den = ccw * (ex * dy - ey * dx);
    if (Math.abs(den) < 1e-15) {
      if (num < -1e-12) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  if (t1 - t0 < 1e-9) return null;
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ];
}

/** Crease segments that lie on one sheet polygon, as a path in sheet coordinates. Memoised per polygon. */
const creaseCache = new WeakMap<readonly Vec2[], { creases: readonly Crease[]; d: string }>();
export function creasePathOn(sheet: readonly Vec2[], creases: readonly Crease[]): string {
  const hit = creaseCache.get(sheet);
  if (hit && hit.creases === creases) return hit.d;
  let d = '';
  for (const c of creases) {
    const s = clipSegment(c.a, c.b, sheet);
    if (s) d += `M${+s[0][0].toFixed(6)} ${+s[0][1].toFixed(6)}L${+s[1][0].toFixed(6)} ${+s[1][1].toFixed(6)}`;
  }
  creaseCache.set(sheet, { creases, d });
  return d;
}

/** The part of an infinite fold line inside a rectangle grown by `margin`. */
export function lineInBox(line: FoldLine, min: Vec2, max: Vec2, margin = 0): [Vec2, Vec2] | null {
  const dx = line.b[0] - line.a[0];
  const dy = line.b[1] - line.a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return null;
  const far = 10 * (Math.abs(max[0] - min[0]) + Math.abs(max[1] - min[1]) + L + 1);
  const a: Vec2 = [line.a[0] - (dx / L) * far, line.a[1] - (dy / L) * far];
  const b: Vec2 = [line.a[0] + (dx / L) * far, line.a[1] + (dy / L) * far];
  const x0 = min[0] - margin;
  const y0 = min[1] - margin;
  const x1 = max[0] + margin;
  const y1 = max[1] + margin;
  return clipSegment(a, b, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}

/** Sheet -> table isometry inverse applied to a point. */
export function isoInverse(iso: Iso2, p: Vec2): Vec2 {
  const [a, b, c, d, tx, ty] = iso;
  const x = p[0] - tx;
  const y = p[1] - ty;
  // [a b; c d] is orthogonal: inverse = transpose.
  return [a * x + c * y, b * x + d * y];
}

/** Bounding box of face vertices in table x, y. */
export function facesBounds(faces: readonly SceneFace[]): { min: Vec2; max: Vec2; topZ: number } | null {
  if (faces.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (const f of faces) {
    for (const v of f.verts) {
      x0 = Math.min(x0, v[0]);
      y0 = Math.min(y0, v[1]);
      x1 = Math.max(x1, v[0]);
      y1 = Math.max(y1, v[1]);
      z1 = Math.max(z1, v[2]);
    }
  }
  return { min: [x0, y0], max: [x1, y1], topZ: z1 };
}
