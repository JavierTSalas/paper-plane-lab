import { clamp, DEG, dot3, smoothstep } from '../math';
import { PAPER_STOCK } from '../paper';
import type {
  AeroElement, Airframe, LiftingSurface, Mat3, Panel, PanelRole, PaperStock, PosedModel, TrimSpec, Vec3,
} from '../types';
import {
  EXPOSURE_FULL_SPREAD_DEG, LAYER_SAMPLE_LINES, OWN_SURFACE_ANGLE_DEG, REFERENCE_AIR_DENSITY, STANDARD_GRAVITY,
  WALL_STRIPS, WETTED_ONE_FACE_SPREAD_DEG, WETTED_TWO_FACE_SPREAD_DEG, WING_STRIPS, WINGLET_STRIPS,
} from './constants';
import { laminaMassProps } from './massProps';
import type { PointMass } from './massProps';
import { panelMaxLayers, panelPoint, projectPanel, sliceStrips } from './strips';
import type { PanelShape } from './strips';
import {
  blendCoefficients, deltanessFromSweep, plateAddedMass, slenderCpFraction, surfaceCoefficients,
} from './surfaces';
import type { SurfaceCoefficients } from './surfaces';

/** Largest bent chord fraction the flap model is used for (thin-airfoil tau is meant for small flaps). */
const MAX_BEND_FRAC = 0.5;
/** Projected area below which a model has no horizontal lifting surface at all, m². */
const MIN_REF_AREA = 1e-8;
/** Contact points closer than this are one point, metres. */
const CONTACT_MERGE = 1e-6;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** An element under construction, with the strip data the later passes need. */
interface Draft {
  el: Mutable<AeroElement>;
  /** Strip width, metres. */
  width: number;
  /** Mid-chord point, body frame. */
  mid: Vec3;
  spanAxis: Vec3;
  /** Panel coordinates of the leading edge. */
  leU: number;
  leV: number;
  /** First (front) / last (rear) chordwise interval of its strip. */
  front: boolean;
  rear: boolean;
}

const isWingLike = (role: PanelRole): boolean => role === 'wing' || role === 'center';

/** Angle between the two fuselage walls from their normals, radians. 0 = pressed together, pi = flat. */
function wallSpread(panels: readonly Panel[]): number | null {
  const right = panels.find((p) => p.role === 'fuselage' && p.side === 1);
  const left = panels.find((p) => p.role === 'fuselage' && p.side === -1);
  if (!right || !left) return null;
  return Math.PI - Math.acos(clamp(dot3(right.normal, left.normal), -1, 1));
}

function stripCount(panel: Panel, shape: PanelShape, model: PosedModel): number {
  switch (panel.role) {
    case 'wing':
      return WING_STRIPS;
    case 'fuselage':
      return WALL_STRIPS;
    case 'winglet':
      return WINGLET_STRIPS;
    case 'center': {
      // A centre panel spans both sides: give it the strip width a wing panel of this model would have.
      const target = model.span > 0 ? model.span / (2 * WING_STRIPS) : 0;
      const extent = shape.vMax - shape.vMin;
      const pairs = target > 0 ? Math.round(extent / (2 * target)) : WING_STRIPS;
      return 2 * clamp(pairs, 1, WING_STRIPS);
    }
  }
}

/** Weighted least-squares slope dy/dx. Zero when x has no spread. */
function fitSlope(xs: readonly number[], ys: readonly number[], ws: readonly number[]): number {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < xs.length; i++) {
    sw += ws[i];
    sx += ws[i] * xs[i];
    sy += ws[i] * ys[i];
  }
  if (!(sw > 0)) return 0;
  const mx = sx / sw;
  const my = sy / sw;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += ws[i] * (xs[i] - mx) * (xs[i] - mx);
    sxy += ws[i] * (xs[i] - mx) * (ys[i] - my);
  }
  return sxx > 1e-14 ? sxy / sxx : 0;
}

const surfaceOf = (
  role: PanelRole, area: number, span: number, aspectRatio: number, c: SurfaceCoefficients,
): LiftingSurface => ({
  role,
  area,
  span,
  aspectRatio,
  meanChord: span > 0 ? area / span : 0,
  deltaness: c.deltaness,
  kp: c.kp,
  kv: c.kv,
  alphaStall: c.alphaStall,
  stallWidth: c.stallWidth,
  cd90: c.cd90,
  k0: c.k0,
  vortexCp: c.vortexCp,
  flapEfficiency: c.flapEfficiency,
});

/** How far a secondary panel stands out of the wing plane: 0 = coplanar (use the wing's constants), 1 = its own surface. */
function ownSurfaceWeight(normal: Vec3, wingNormal: Vec3 | null): number {
  if (!wingNormal) return 1;
  const angle = Math.acos(clamp(Math.abs(dot3(normal, wingNormal)), 0, 1));
  return smoothstep(0, OWN_SURFACE_ANGLE_DEG * DEG, angle);
}

/** Add m * a a^T to a symmetric 3x3 accumulator. */
function addOuter(acc: number[], a: Vec3, m: number): void {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) acc[i * 3 + j] += m * a[i] * a[j];
}

/**
 * Apparent mass and inertia of the surrounding air as body-frame tensors (doc 01 section 7 and 10.2,
 * doc 02 sections 3 and 9).
 *
 * Each group of elements (wing pair, fuselage, each winglet) gets the 3D added mass of a plate with its span
 * and mean chord, using the shorter side as the reference dimension (the corrected AR < 1 rule of doc 01).
 * The 2D strip values rho pi c² / 4 per unit span are an upper bound; they are scaled so that their sum equals
 * that 3D value (doc 02 section 9) and then give the tensors
 *   M_a = sum m_e n n^T,   I_a = sum m_e (r x n)(r x n)^T + sum i_e s s^T,
 * with r the mid-chord point from the CG, s the strip's span axis and i_e the scaled strip value
 * rho pi c^4 / 128 per unit span. The (r x n) term is the offset term (1 + 8 (2d / c)²) of doc 02 in 3D.
 * Translation-rotation coupling terms are not part of the Airframe contract and are left out.
 */
function apparentTensors(
  groups: readonly { drafts: Draft[]; mass3d: number }[],
  cg: Vec3,
  rho: number,
): { mass: Mat3; inertia: Mat3 } {
  const mass = new Array<number>(9).fill(0);
  const inertia = new Array<number>(9).fill(0);
  for (const group of groups) {
    let stripSum = 0;
    for (const d of group.drafts) stripSum += (d.el.exposure * rho * Math.PI * d.el.chord * d.el.chord * d.width) / 4;
    if (!(stripSum > 0)) continue;
    const scale = Math.min(1, group.mass3d / stripSum);
    for (const d of group.drafts) {
      const c = d.el.chord;
      const strip = d.el.exposure * rho * Math.PI * c * c * d.width * scale;
      const me = strip / 4;
      const n = d.el.normal;
      const r: Vec3 = [d.mid[0] - cg[0], d.mid[1] - cg[1], d.mid[2] - cg[2]];
      const rxn: Vec3 = [r[1] * n[2] - r[2] * n[1], r[2] * n[0] - r[0] * n[2], r[0] * n[1] - r[1] * n[0]];
      addOuter(mass, n, me);
      addOuter(inertia, rxn, me);
      addOuter(inertia, d.spanAxis, (strip * c * c) / 128);
    }
  }
  return { mass: mass as unknown as Mat3, inertia: inertia as unknown as Mat3 };
}

/** Points for ground and wall contact tests: nose, tail, wing tips, keel bottom, top, winglet tips. */
function contactPoints(model: PosedModel): Vec3[] {
  const verts: Vec3[] = [];
  for (const piece of model.pieces) for (const v of piece.verts) verts.push(v);
  const out: Vec3[] = [];
  const add = (p: Vec3 | undefined): void => {
    if (!p) return;
    if (out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < CONTACT_MERGE)) return;
    out.push([p[0], p[1], p[2]]);
  };
  // For each body direction: the vertices farthest that way, reduced to the two ends of that edge.
  const extremes = (from: readonly Vec3[], axis: 0 | 1 | 2, sign: 1 | -1, along: 0 | 1 | 2): void => {
    let best = -Infinity;
    for (const v of from) best = Math.max(best, sign * v[axis]);
    let lo: Vec3 | undefined;
    let hi: Vec3 | undefined;
    for (const v of from) {
      if (sign * v[axis] < best - CONTACT_MERGE) continue;
      if (!lo || v[along] < lo[along]) lo = v;
      if (!hi || v[along] > hi[along]) hi = v;
    }
    add(lo);
    add(hi);
  };
  extremes(verts, 0, 1, 2); // nose
  extremes(verts, 0, -1, 2); // tail corners
  extremes(verts, 2, 1, 0); // right tip, fore and aft
  extremes(verts, 2, -1, 0); // left tip
  extremes(verts, 1, -1, 0); // lowest points (keel)
  extremes(verts, 1, 1, 0); // highest points
  for (const panel of model.panels) {
    if (panel.role !== 'winglet') continue;
    const own: Vec3[] = [];
    for (const id of panel.pieceIds) for (const v of model.pieces[id].verts) own.push(v);
    extremes(own, 1, 1, 0);
    extremes(own, 1, -1, 0);
  }
  return out;
}

/**
 * Turn a posed paper model into the physics-ready airframe: mass properties, aerodynamic elements,
 * lifting surfaces, apparent mass and reference quantities (ARCHITECTURE.md section 6.1).
 */
export function buildAirframe(model: PosedModel, trim: TrimSpec, stock: PaperStock = PAPER_STOCK): Airframe {
  /* ---- mass, CG, inertia ---- */
  const arealDensity = stock.gsm / 1000;
  const ballast: PointMass[] = [];
  if (trim.clip && trim.clip.mass > 0) {
    // The clip grips the fuselage: on the centreline, at the mid-height of the walls (keel line when there are none).
    const wallPieces = model.pieces.filter((p) => model.panels[p.panel]?.role === 'fuselage');
    const clipY = wallPieces.length > 0 ? laminaMassProps(wallPieces, arealDensity).cg[1] : 0;
    ballast.push({ mass: trim.clip.mass, pos: [trim.clip.x, clipY, 0] });
  }
  const props = laminaMassProps(model.pieces, arealDensity, ballast);
  const cg = props.cg;

  /* ---- elements: one per spanwise strip per covered chordwise interval ---- */
  const spread = wallSpread(model.panels);
  const wallExposure = spread === null ? 1 : 0.5 + 0.5 * smoothstep(0, EXPOSURE_FULL_SPREAD_DEG * DEG, spread);
  const wallWetted =
    spread === null ? 2 : 1 + smoothstep(WETTED_ONE_FACE_SPREAD_DEG * DEG, WETTED_TWO_FACE_SPREAD_DEG * DEG, spread);

  const shapes = model.panels.map((panel) => projectPanel(panel, model.pieces));
  const drafts: Draft[] = [];
  const byPanel: Draft[][] = model.panels.map(() => []);
  model.panels.forEach((panel, pi) => {
    const shape = shapes[pi];
    const frame = shape.frame;
    const wall = panel.role === 'fuselage';
    for (const strip of sliceStrips(shape, stripCount(panel, shape, model))) {
      strip.intervals.forEach(([aft, fore], j) => {
        const chord = fore - aft;
        const draft: Draft = {
          el: {
            panel: panel.index,
            role: panel.role,
            side: panel.side,
            surface: 0,
            area: chord * strip.width,
            chord,
            le: panelPoint(frame, fore, strip.vMid),
            chordDir: [0 - frame.fwd[0], 0 - frame.fwd[1], 0 - frame.fwd[2]],
            normal: frame.normal,
            bendFrac: 0,
            bendRad: 0,
            exposure: wall ? wallExposure : 1,
            wettedFaces: wall ? wallWetted : 2,
          },
          width: strip.width,
          mid: panelPoint(frame, (fore + aft) / 2, strip.vMid),
          spanAxis: frame.spanAxis,
          leU: fore,
          leV: strip.vMid,
          front: j === 0,
          rear: j === strip.intervals.length - 1,
        };
        drafts.push(draft);
        byPanel[pi].push(draft);
      });
    }
  });

  /* ---- reference geometry: the top-view planform of everything ---- */
  let noseX = -Infinity;
  let tailX = Infinity;
  for (const piece of model.pieces) {
    for (const v of piece.verts) {
      noseX = Math.max(noseX, v[0]);
      tailX = Math.min(tailX, v[0]);
    }
  }
  const length = noseX > tailX ? noseX - tailX : 0;

  let projected = 0;
  for (const d of drafts) projected += d.el.area * Math.abs(d.el.normal[1]);
  // A model with no horizontal surface at all (a lone fin) falls back to its true area.
  const horizontal = projected > MIN_REF_AREA;
  let refArea = 0;
  let chordSum = 0;
  let leSum = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const d of drafts) {
    const w = d.el.area * (horizontal ? Math.abs(d.el.normal[1]) : 1);
    refArea += w;
    chordSum += w * d.el.chord;
    leSum += w * d.el.le[0];
    const half = 0.5 * d.width * d.spanAxis[2];
    const cz = 0.5 * d.el.chord * d.el.chordDir[2];
    for (const z of [d.mid[2] + half + cz, d.mid[2] + half - cz, d.mid[2] - half + cz, d.mid[2] - half - cz]) {
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
  }
  const zSpan = zMax > zMin ? zMax - zMin : 0;
  const mac = refArea > 0 ? chordSum / refArea : 0;
  // Without any z extent (a lone fin on the centreline) use the span of a square of the same area.
  const refSpan = zSpan > 1e-9 ? zSpan : Math.sqrt(refArea);
  const refAspect = refArea > 0 ? (refSpan * refSpan) / refArea : 0;

  /* ---- lifting surfaces (doc 01 section 10.1) ---- */
  const surfaces: LiftingSurface[] = [];
  const groups: { drafts: Draft[]; mass3d: number }[] = [];
  const rho = REFERENCE_AIR_DENSITY;

  const wingDrafts = drafts.filter((d) => isWingLike(d.el.role));
  let wingCoefs: SurfaceCoefficients | null = null;
  if (wingDrafts.length > 0) {
    // Leading-edge sweep: fit of the leading-edge x against the distance from the centreline.
    const fronts = wingDrafts.filter((d) => d.front);
    const slope = fitSlope(
      fronts.map((d) => Math.abs(d.el.le[2])),
      fronts.map((d) => d.el.le[0]),
      fronts.map((d) => d.width * Math.abs(d.el.normal[1])),
    );
    const sweep = Math.atan(Math.max(0, -slope));
    const deltaCp = slenderCpFraction(
      fronts.map((d) => {
        const flat = Math.abs(d.el.normal[1]);
        return {
          leX: d.el.le[0],
          chord: d.el.chord,
          outer: Math.abs(d.el.le[2]) + 0.5 * d.width * Math.abs(d.spanAxis[2]),
          area: d.el.area * flat,
        };
      }),
    );
    wingCoefs = surfaceCoefficients(refAspect, deltanessFromSweep(sweep), deltaCp);
    for (const d of wingDrafts) d.el.surface = surfaces.length;
    surfaces.push(surfaceOf('wing', refArea, refSpan, refAspect, wingCoefs));
    let developedSpan = 0;
    let area = 0;
    for (const d of wingDrafts) {
      area += d.el.area;
      if (d.front) developedSpan += d.width;
    }
    groups.push({ drafts: wingDrafts, mass3d: plateAddedMass(rho, developedSpan, area / developedSpan) });
  }

  // Normal of the wing plane a secondary panel on the given side is attached to.
  const wingNormalOn = (side: -1 | 0 | 1): Vec3 | null => {
    const panel =
      model.panels.find((p) => p.role === 'wing' && p.side === side && byPanel[p.index].length > 0) ??
      model.panels.find((p) => isWingLike(p.role) && byPanel[p.index].length > 0);
    return panel ? shapes[panel.index].frame.normal : null;
  };

  const wallPanels = model.panels.filter((p) => p.role === 'fuselage' && byPanel[p.index].length > 0);
  if (wallPanels.length > 0) {
    // One vertical surface for both walls; the wing above acts as a reflection plane: AR = 2 h² / S_wall.
    let height = 0;
    let area = 0;
    let weight = 0;
    for (const panel of wallPanels) {
      const shape = shapes[panel.index];
      height += shape.vMax - shape.vMin;
      for (const d of byPanel[panel.index]) area += d.el.area;
      weight += ownSurfaceWeight(shape.frame.normal, wingNormalOn(panel.side));
    }
    height /= wallPanels.length;
    area /= wallPanels.length;
    weight /= wallPanels.length;
    const aspect = area > 0 ? (2 * height * height) / area : 0;
    const own = surfaceCoefficients(aspect, 0);
    const coefs = wingCoefs ? blendCoefficients(wingCoefs, own, weight) : own;
    const wallDrafts = wallPanels.flatMap((p) => byPanel[p.index]);
    for (const d of wallDrafts) d.el.surface = surfaces.length;
    surfaces.push(surfaceOf('fuselage', area, height, aspect, coefs));
    // Added mass with the same mirror image: half of a plate twice as high, once per exposed wall.
    const perWall = 0.5 * plateAddedMass(rho, 2 * height, height > 0 ? area / height : 0);
    groups.push({ drafts: wallDrafts, mass3d: perWall * wallExposure * wallPanels.length });
  }

  for (const panel of model.panels) {
    const own = byPanel[panel.index];
    if (panel.role !== 'winglet' || own.length === 0) continue;
    const shape = shapes[panel.index];
    const height = shape.vMax - shape.vMin;
    let area = 0;
    for (const d of own) area += d.el.area;
    const aspect = area > 0 ? (height * height) / area : 0;
    const fronts = own.filter((d) => d.front);
    const slope = fitSlope(fronts.map((d) => d.leV), fronts.map((d) => d.leU), fronts.map((d) => d.width));
    const ownCoefs = surfaceCoefficients(aspect, deltanessFromSweep(Math.atan(Math.abs(slope))));
    const weight = ownSurfaceWeight(shape.frame.normal, wingNormalOn(panel.side));
    const coefs = wingCoefs ? blendCoefficients(wingCoefs, ownCoefs, weight) : ownCoefs;
    for (const d of own) d.el.surface = surfaces.length;
    surfaces.push(surfaceOf('winglet', area, height, aspect, coefs));
    groups.push({ drafts: own, mass3d: plateAddedMass(rho, height, height > 0 ? area / height : 0) });
  }

  /* ---- trim bends (doc 01 sections 8 and 10.2: thin-airfoil flap on the element, no separate element) ---- */
  const bendFrac = clamp(trim.elevatorChordFrac, 0, MAX_BEND_FRAC);
  const elevator = trim.elevatorDeg * DEG;
  const aileron = trim.aileronDeg * DEG;
  const rudder = trim.rudderDeg * DEG;
  for (const d of drafts) {
    if (!d.rear || bendFrac <= 0) continue;
    let bend = 0;
    if (isWingLike(d.el.role)) {
      // Positive elevator = trailing edge up = toward +normal. Positive aileron: right trailing edge up, left down.
      const sideSign = d.el.side !== 0 ? d.el.side : Math.abs(d.mid[2]) < 1e-9 ? 0 : Math.sign(d.mid[2]);
      bend = elevator + sideSign * aileron;
    } else if (d.el.role === 'fuselage') {
      // Positive rudder = nose right = trailing edge of the walls toward +z.
      const nz = d.el.normal[2];
      bend = Math.abs(nz) < 1e-9 ? 0 : Math.sign(nz) * rudder;
    }
    if (bend !== 0) {
      d.el.bendFrac = bendFrac;
      d.el.bendRad = bend;
    }
  }

  /* ---- apparent mass, layers, contact ---- */
  const apparent = apparentTensors(groups, cg, rho);

  const pressed = spread !== null && spread < WETTED_ONE_FACE_SPREAD_DEG * DEG;
  let maxLayers = 0;
  model.panels.forEach((panel, pi) => {
    const layers = panelMaxLayers(shapes[pi], LAYER_SAMPLE_LINES);
    // Walls pressed together stack on each other.
    maxLayers = Math.max(maxLayers, panel.role === 'fuselage' && pressed ? 2 * layers : layers);
  });

  return {
    mass: props.mass,
    cg,
    inertia: props.inertia,
    apparentMass: apparent.mass,
    apparentInertia: apparent.inertia,
    elements: drafts.map((d) => d.el),
    surfaces,
    ref: {
      area: refArea,
      span: refSpan,
      mac,
      macLeX: refArea > 0 ? leSum / refArea : 0,
      aspectRatio: refAspect,
      length,
      wingLoading: refArea > 0 ? (props.mass * STANDARD_GRAVITY) / refArea : 0,
    },
    cgFromNose: length > 0 ? (noseX - cg[0]) / length : 0,
    maxLayers,
    contactPoints: contactPoints(model),
  };
}
