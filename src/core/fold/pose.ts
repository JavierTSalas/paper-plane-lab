import { DEG, norm3, rotateAboutAxis, scale3, sub3 } from '../math';
import { foldFlat, piecePolygon, tableBounds } from './flat';
import { applyIso, centroid, EPS, lineDistance, MIN_FEATURE, mirrorPoint, splitByLine, toLine } from './geom';
import type { Bounds, Line } from './geom';
import { isSymmetric } from './query';
import type {
  FlatPiece, FlatState, FoldIssue, FoldLine, FoldResult, HingeAngles, Panel, PanelRole, PlaneDesign, PosedModel,
  PosedPiece, ShapeSpec, Vec2, Vec3,
} from '../types';

/** `step` of an issue that belongs to the 3D shape, not to a fold step. */
export const SHAPE_STEP = -1;

/** A shape line closer than this (cosine) to perpendicular to the centreline has no inboard side. */
const MIN_NOSEWARD = 1e-6;

/** The hinge angles of the finished plane. */
export function finalHingeAngles(shape: ShapeSpec): HingeAngles {
  const dihedral = shape.dihedralDeg * DEG;
  const winglet = shape.wingletDeg * DEG;
  if (shape.keel === 'none') return { keel: 0, wing: -dihedral, winglet };
  const keel = (90 - shape.keelSpreadDeg / 2) * DEG;
  return { keel, wing: keel - dihedral, winglet };
}

/** One rigid rotation about a line in the body frame. */
interface Hinge {
  origin: Vec3;
  axis: Vec3;
  angle: number;
}

const swing = (chain: readonly Hinge[], p: Vec3): Vec3 =>
  chain.reduce((q, h) => rotateAboutAxis(q, h.origin, h.axis, h.angle), p);

/** A piece of the flat model after cutting along the shape lines. */
interface Part {
  piece: FlatPiece;
  sheet: Vec2[];
}

function cutParts(parts: readonly Part[], line: Line): Part[] {
  return parts.flatMap((part) => {
    const { pos, neg } = splitByLine(part.sheet, part.piece.iso, line);
    return pos && neg ? [{ ...part, sheet: pos }, { ...part, sheet: neg }] : [part];
  });
}

/** Direct a shape line toward the nose, so that its right is outboard. Null when it has no such direction. */
function noseward(line: FoldLine | null): Line | null {
  const l = toLine(line);
  if (!l || Math.abs(l.u[1]) < MIN_NOSEWARD) return null;
  return l.u[1] > 0 ? l : { p: l.p, u: [-l.u[0], -l.u[1]] };
}

const xAt = (line: Line, y: number): number => line.p[0] + ((y - line.p[1]) * line.u[0]) / line.u[1];

const mirrorOf = (line: Line, cx: number): Line => ({ p: mirrorPoint(line.p, cx), u: [-line.u[0], line.u[1]] });

/** Everything about the flat model the shape lines are checked against. */
interface Outline {
  cx: number;
  bounds: Bounds;
  /** Every table vertex, mirrored onto the right half. */
  rightVerts: Vec2[];
}

/**
 * A usable shape line: directed noseward, at or outboard of `inner` along the whole length of the model,
 * with paper beyond it. `inner` null stands for the centreline.
 */
function usableLine(line: FoldLine | null, inner: Line | null, outline: Outline): Line | null {
  const l = noseward(line);
  if (!l) return null;
  const { cx, bounds, rightVerts } = outline;
  const innerX = (y: number): number => (inner ? xAt(inner, y) : cx);
  for (const y of [bounds.min[1], bounds.max[1]]) {
    if (xAt(l, y) < innerX(y) - EPS) return null;
  }
  return rightVerts.some((v) => lineDistance(l, v) < -MIN_FEATURE) ? l : null;
}

const shapeIssue = (message: string): FoldIssue => ({ step: SHAPE_STEP, severity: 'error', code: 'shape-line-invalid', message });

const PANEL_ORDER: PanelRole[] = ['center', 'fuselage', 'wing', 'winglet'];

/**
 * Open a flat-folded model into the 3D airplane (ARCHITECTURE.md section 5.2).
 *
 * The right half is posed by a chain of hinge rotations (keel, wing line, winglet line); the left half
 * runs through the very same arithmetic on mirrored coordinates, so the two halves mirror each other in z.
 * With all angles zero the result is the flat layout: x = table y, z = +/-(table x - centre), y = 0.
 *
 * Never throws. A shape line that cannot be used is reported (`shape-line-invalid`, error) and ignored.
 * A flat model that is not mirror-symmetric is reported (`not-symmetric`, warning) and posed as it is.
 * Issues carry `step: SHAPE_STEP`. Piece ids are indices into `model.pieces`.
 */
export function poseModel(
  flat: FlatState,
  shape: ShapeSpec,
  angles: HingeAngles = finalHingeAngles(shape),
): { model: PosedModel; issues: FoldIssue[] } {
  const issues: FoldIssue[] = [];
  const cx = flat.paper.width / 2;
  const keeled = shape.keel !== 'none';
  const s = shape.keel === 'mountain' ? -1 : 1;
  const used: HingeAngles = { keel: keeled ? angles.keel : 0, wing: angles.wing, winglet: angles.winglet };

  if (!isSymmetric(flat)) {
    issues.push({
      step: SHAPE_STEP,
      severity: 'warning',
      code: 'not-symmetric',
      message: 'The folded model is not the same on both sides of the centreline, so the plane will be lopsided.',
    });
  }

  const outline: Outline = {
    cx,
    bounds: tableBounds(flat),
    rightVerts: flat.pieces.flatMap((p) => piecePolygon(p).map((v): Vec2 => [cx + Math.abs(v[0] - cx), v[1]])),
  };
  const wing = usableLine(shape.wingLine, null, outline);
  if (shape.wingLine && !wing) {
    issues.push(shapeIssue('The wing line must run nose to tail on the right half and leave paper outboard of it.'));
  }
  const winglet = usableLine(shape.wingletLine, wing, outline);
  if (shape.wingletLine && !winglet) {
    issues.push(shapeIssue('The winglet line must run nose to tail outboard of the wing line and leave paper beyond it.'));
  }

  let parts: Part[] = flat.pieces.map((piece) => ({ piece, sheet: piece.sheet }));
  if (keeled) parts = cutParts(parts, { p: [cx, 0], u: [0, 1] });
  for (const line of [wing, winglet]) {
    if (line) parts = cutParts(cutParts(parts, line), mirrorOf(line, cx));
  }

  // Hinge chains of the right half, in the flat body layout (x = table y, y = 0, z = table x - centre).
  const flat3 = (p: Vec2): Vec3 => [p[1], 0, p[0] - cx];
  const hingeOn = (chain: readonly Hinge[], line: Line, angle: number): Hinge => {
    const origin = swing(chain, flat3(line.p));
    const ahead = swing(chain, flat3([line.p[0] + line.u[0], line.p[1] + line.u[1]]));
    return { origin, axis: norm3(sub3(ahead, origin)), angle };
  };
  // Rotating about a noseward axis by a positive angle carries outboard points down.
  const fuselageChain: Hinge[] = keeled ? [{ origin: [0, 0, 0], axis: [1, 0, 0], angle: -used.keel }] : [];
  const wingChain = wing ? [...fuselageChain, hingeOn(fuselageChain, wing, used.wing)] : fuselageChain;
  const wingletChain = winglet ? [...wingChain, hingeOn(wingChain, winglet, -used.winglet)] : wingChain;
  const chains: Record<PanelRole, readonly Hinge[]> = {
    center: [],
    fuselage: fuselageChain,
    wing: wingChain,
    winglet: wingletChain,
  };
  const hingePoint: Record<PanelRole, Vec3> = {
    center: [0, 0, 0],
    fuselage: [0, 0, 0],
    wing: wingChain[wingChain.length - 1]?.origin ?? [0, 0, 0],
    winglet: wingletChain[wingletChain.length - 1]?.origin ?? [0, 0, 0],
  };

  // Level the model: pitch it about the lateral axis so the wing root line is horizontal. When the wing
  // fold is not parallel to the centre crease (the classic dart), the wings, not the keel, define "level":
  // body +x then points along the wing root and a zero-dihedral wing has the normal [0, 1, 0].
  const rootAxis = wing ? wingChain[wingChain.length - 1]!.axis : null;
  const pitch = rootAxis ? Math.atan2(rootAxis[1], rootAxis[0]) : 0;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const level = (p: Vec3): Vec3 => [p[0] * cosP + p[1] * sinP, p[1] * cosP - p[0] * sinP, p[2]];

  const placed = parts.map((part) => {
    const mid = centroid(part.sheet.map((v) => applyIso(part.piece.iso, v)));
    const half = mid[0] < cx ? -1 : 1;
    const folded: Vec2 = [cx + Math.abs(mid[0] - cx), mid[1]];
    const role: PanelRole =
      winglet && lineDistance(winglet, folded) < 0
        ? 'winglet'
        : wing && lineDistance(wing, folded) < 0
          ? 'wing'
          : keeled
            ? 'fuselage'
            : 'center';
    const side: -1 | 0 | 1 = role === 'center' ? 0 : s * half < 0 ? -1 : 1;
    // Centre pieces stay in the flat layout. The others are posed as right-half pieces and mirrored back.
    const lateral = role === 'center' ? 1 : half;
    const mirror = role === 'center' ? 1 : side;
    const verts = part.sheet.map((v): Vec3 => {
      const t = applyIso(part.piece.iso, v);
      const p = level(swing(chains[role], [t[1], 0, lateral * (t[0] - cx)]));
      return [p[0], p[1], mirror * p[2]];
    });
    return { part, role, side, verts };
  });

  let tail = Infinity;
  let nose = -Infinity;
  let low = Infinity;
  let high = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  // y = 0 is the lowest point of the keel line (or the centre panel when there is no keel).
  let keelLow = Infinity;
  for (const { verts, role } of placed) {
    for (const [x, y, z] of verts) {
      if (role === 'fuselage' || role === 'center') keelLow = Math.min(keelLow, y);
      tail = Math.min(tail, x);
      nose = Math.max(nose, x);
      low = Math.min(low, y);
      high = Math.max(high, y);
      left = Math.min(left, z);
      right = Math.max(right, z);
    }
  }

  const drop = Number.isFinite(keelLow) ? keelLow : 0;
  low -= drop;
  high -= drop;

  const panels: Panel[] = [];
  const panelOf = (role: PanelRole, side: -1 | 0 | 1): Panel => {
    const known = panels.find((p) => p.role === role && p.side === side);
    if (known) return known;
    const chain = chains[role];
    const up = level(sub3(swing(chain, [0, 1, 0]), swing(chain, [0, 0, 0])));
    const mirror = side === 0 ? 1 : side;
    const normal: Vec3 = [up[0], up[1], mirror * up[2]];
    const hinge = level(hingePoint[role]);
    const panel: Panel = {
      index: panels.length,
      role,
      side,
      origin: [hinge[0] - tail, hinge[1] - drop, mirror * hinge[2]],
      normal,
      stackDir: scale3(normal, s),
      pieceIds: [],
    };
    panels.push(panel);
    return panel;
  };
  // Fixed panel order: centre, fuselage, wing, winglet; right before left.
  for (const role of PANEL_ORDER) {
    for (const side of [0, 1, -1] as const) {
      if (placed.some((p) => p.role === role && p.side === side)) panelOf(role, side);
    }
  }

  const pieces: PosedPiece[] = placed.map(({ part, role, side, verts }, id) => {
    const panel = panelOf(role, side);
    panel.pieceIds.push(id);
    return {
      id,
      panel: panel.index,
      verts: verts.map(([x, y, z]): Vec3 => [x - tail, y - drop, z]),
      sheet: part.sheet,
      frontNormal: part.piece.flipped ? scale3(panel.stackDir, -1) : panel.stackDir,
      layer: part.piece.layer,
    };
  });

  return {
    model: {
      paper: flat.paper,
      angles: used,
      pieces,
      panels,
      length: nose - tail,
      span: right - left,
      height: high - low,
    },
    issues,
  };
}

/**
 * A sensible starting shape for any symmetric fold: valley keel with a 10 degree spread, a wing line
 * parallel to the centreline, 8 degrees of dihedral and no winglets.
 * The fuselage is 12 % of the sheet's half-width deep (about half an inch on A4 or Letter), and never
 * more than half of what the folded model has to offer, so the wing line always cuts the model.
 * A model with no width to either side of the centreline gets no keel and no wing line.
 */
export function defaultShape(flat: FlatState): ShapeSpec {
  const cx = flat.paper.width / 2;
  const { min, max } = tableBounds(flat);
  // poseModel mirrors the left half onto the right, so a lopsided model is measured on its wider side.
  const reach = Math.max(max[0] - cx, cx - min[0]);
  const depth = Math.min(0.12 * cx, 0.5 * reach);
  const flatWing = depth <= MIN_FEATURE;
  return {
    keel: flatWing ? 'none' : 'valley',
    keelSpreadDeg: 10,
    wingLine: flatWing ? null : { a: [cx + depth, min[1]], b: [cx + depth, max[1]] },
    dihedralDeg: 8,
    wingletLine: null,
    wingletDeg: 0,
  };
}

/** Fold a design flat and open it into its 3D shape. */
export function buildPlane(design: PlaneDesign): { fold: FoldResult; model: PosedModel; issues: FoldIssue[] } {
  const fold = foldFlat(design.paper, design.steps);
  const posed = poseModel(fold.final, design.shape);
  return { fold, model: posed.model, issues: [...fold.issues, ...posed.issues] };
}
