/**
 * Paper Plane Lab — shared contracts.
 *
 * Everything under src/core is pure TypeScript: no DOM, no three.js, no React.
 * The same code runs in the browser, in tests, and in a Cloudflare Worker
 * (server-side re-simulation of leaderboard entries).
 *
 * UNITS: SI everywhere. Metres, kilograms, seconds, radians.
 * Fields that hold degrees end in `Deg`. Grammage is the one exception (g/m², field `gsm`).
 *
 * FRAMES
 *  Sheet frame   2D. Origin at the bottom-left corner of the unfolded sheet, x right, y up.
 *                The FRONT face of the paper faces the viewer (+z) before any fold.
 *  Table frame   2D. Where the flat-folded model lies. Starts identical to the sheet frame.
 *                The nose of every plane points toward +y. The centreline is x = paper.width / 2.
 *  Body frame    3D, right-handed. +x toward the nose along the wing root line, +y up, +z toward the
 *                right wing (starboard). Origin: in the plane of symmetry, x = 0 at the rearmost point of
 *                the model (tail) and y = 0 at the lowest point of the keel line, so every body x is >= 0
 *                and the nose is at x = length.
 *  World frame   3D, right-handed, identical axes to three.js. +x downrange, +y up, +z right of the thrower.
 *                Ground is y = 0. Gravity is (0, -g, 0).
 *
 * ANGLES
 *  alpha (angle of attack)  positive when the relative wind hits the underside.
 *  beta  (sideslip)         positive when the relative wind comes from the right (+z) side.
 *  Quaternions are [x, y, z, w] and rotate body-frame vectors into the world frame.
 */

/* ------------------------------------------------------------------ */
/* Math primitives                                                    */
/* ------------------------------------------------------------------ */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
/** Unit quaternion [x, y, z, w]; body -> world. */
export type Quat = readonly [number, number, number, number];
/** 3x3 matrix, row-major. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/* ------------------------------------------------------------------ */
/* Paper                                                              */
/* ------------------------------------------------------------------ */

export interface PaperSize {
  id: string;
  name: string;
  /** Short side, metres. */
  short: number;
  /** Long side, metres. */
  long: number;
  family: 'iso' | 'us' | 'square';
}

/** One stock for the whole app (same grammage and thickness for every sheet). */
export interface PaperStock {
  gsm: number;
  /** Caliper, metres. */
  thickness: number;
}

export interface PaperSpec {
  sizeId: string;
  /** Extent along sheet x, metres (short side for portrait sheets). */
  width: number;
  /** Extent along sheet y, metres. */
  height: number;
  /** CSS colour of the front face (faces the viewer before folding). */
  front: string;
  /** CSS colour of the back face. */
  back: string;
  /** Optional printed pattern id for the front face (see ui paper patterns). */
  pattern?: string;
}

/* ------------------------------------------------------------------ */
/* Designs: flat fold steps + 3D shaping + trim                       */
/* ------------------------------------------------------------------ */

/** A directed line through two distinct points, table frame. */
export interface FoldLine {
  a: Vec2;
  b: Vec2;
}

/**
 * A simple fold. The part of the model on the `moving` side of the directed line a->b
 * (`left` = the side where cross(b - a, p - a) > 0) is reflected across the line.
 *  dir     valley: the moving part travels toward the viewer and lands on top.
 *          mountain: it travels away from the viewer and lands underneath.
 *  layers  all: every layer on the moving side moves.
 *          flap: only the top flap moves (valley) or the bottom flap (mountain). The flap is the
 *                connected group of layers, within the moving half-plane, that contains the
 *                outermost layer at `pick` (default: midpoint of a-b nudged into the moving side).
 */
export interface FoldStepFold {
  kind: 'fold';
  line: FoldLine;
  moving: 'left' | 'right';
  dir: 'valley' | 'mountain';
  layers: 'all' | 'flap';
  pick?: Vec2;
  /** Short instruction shown to the player, e.g. "Fold the top-left corner to the centre crease". */
  label?: string;
}

/** Fold and unfold: leaves a reference crease, geometry unchanged. */
export interface FoldStepCrease {
  kind: 'crease';
  line: FoldLine;
  label?: string;
}

/** Turn the model over left-to-right (mirror about the centreline x = width / 2). */
export interface FoldStepFlip {
  kind: 'flip';
  label?: string;
}

export type FoldStep = FoldStepFold | FoldStepCrease | FoldStepFlip;

/**
 * How the flat-folded model is opened into a 3D airplane. All flat steps must leave the model
 * mirror-symmetric about the centreline. Lines are given on the RIGHT half (x > width / 2) of the
 * flat model, table frame, and are mirrored to the left half.
 */
export interface ShapeSpec {
  /**
   * Centre fold along the centreline.
   *  valley   the two halves rise toward the viewer; the face seen during folding becomes the TOP of the plane.
   *  mountain the two halves drop away from the viewer; the face seen during folding becomes the UNDERSIDE.
   *  none     no centre fold: a flat flying wing.
   */
  keel: 'valley' | 'mountain' | 'none';
  /** Angle between the two fuselage walls, degrees. 0 = pressed together. */
  keelSpreadDeg: number;
  /** Wing fold line on the right half. null = no wing fold (requires keel 'none' or a pure fuselage). */
  wingLine: FoldLine | null;
  /** Wing angle above the horizontal, degrees. Positive = tips up. */
  dihedralDeg: number;
  /** Winglet fold line on the right wing, or null. */
  wingletLine: FoldLine | null;
  /** Winglet angle from the wing plane, degrees. Positive = up, negative = down. */
  wingletDeg: number;
}

/** Fine tuning a real folder does by hand after folding. */
export interface TrimSpec {
  /** Trailing-edge up-bend of both wings, degrees. Positive = trailing edge up (nose-up trim). */
  elevatorDeg: number;
  /** Fraction of the local chord that is bent, 0.05 - 0.35. */
  elevatorChordFrac: number;
  /** Differential bend, degrees. Positive = roll to the right (right trailing edge up, left down). */
  aileronDeg: number;
  /** Bend of the rear of the keel / fin, degrees. Positive = nose yaws right. */
  rudderDeg: number;
  /** Optional paper-clip ballast. `x` is the body-frame x position of the clip, metres from the tail. */
  clip: { mass: number; x: number } | null;
}

export type PlaneCategory = 'dart' | 'glider' | 'hybrid' | 'wing' | 'custom';

/** A fully specified, serialisable airplane. This is what gets saved, shared and re-simulated. */
export interface PlaneDesign {
  /** Schema version for stored data. */
  v: 1;
  id: string;
  name: string;
  /** Preset id this was folded from, if any. */
  presetId?: string;
  author?: string;
  category: PlaneCategory;
  paper: PaperSpec;
  steps: FoldStep[];
  shape: ShapeSpec;
  trim: TrimSpec;
}

/* ------------------------------------------------------------------ */
/* Flat-folded state                                                  */
/* ------------------------------------------------------------------ */

/**
 * 2D isometry sheet -> table:  x' = a x + b y + tx,  y' = c x + d y + ty.
 * [a b; c d] is orthogonal. det = +1: front face up. det = -1: back face up.
 */
export type Iso2 = readonly [a: number, b: number, c: number, d: number, tx: number, ty: number];

/** One convex facet of the sheet in its current folded position. */
export interface FlatPiece {
  id: number;
  /** Convex polygon in SHEET coordinates, counter-clockwise seen from the front face. */
  sheet: Vec2[];
  /** Sheet -> table isometry. */
  iso: Iso2;
  /** True when the back face is toward the viewer. */
  flipped: boolean;
  /** Stacking rank. Unique per state. 0 lies on the table, higher is closer to the viewer. */
  layer: number;
}

export interface Crease {
  /** Segment in sheet coordinates. */
  a: Vec2;
  b: Vec2;
  /** Assignment as seen from the FRONT face of the unfolded sheet. `aux` = crease-only reference line. */
  assignment: 'valley' | 'mountain' | 'aux';
  /** Index of the step that made it. */
  step: number;
}

export interface FlatState {
  paper: PaperSpec;
  pieces: FlatPiece[];
  creases: Crease[];
}

export interface FoldIssue {
  step: number;
  severity: 'error' | 'warning';
  code:
    | 'line-misses-paper'
    | 'degenerate-line'
    | 'nothing-moves'
    /** The fold would cut the model into more pieces than the engine allows (core/fold MAX_PIECES). */
    | 'too-many-layers'
    | 'flap-blocked'
    | 'not-symmetric'
    | 'shape-line-invalid'
    | 'sliver';
  message: string;
}

/** Everything a renderer needs to animate one step. */
export interface StepFrame {
  index: number;
  step: FoldStep;
  before: FlatState;
  after: FlatState;
  /**
   * `before` pieces after cutting along the fold line (same table positions as `before`).
   * Animate by rotating the pieces listed in `movingIds` about `axis` from 0 to pi.
   * Empty for flips.
   */
  split: FlatPiece[];
  movingIds: number[];
  /** Fold axis, table frame. */
  axis: FoldLine | null;
  /** +1: the flap swings toward the viewer (valley). -1: away (mountain). */
  sense: 1 | -1;
}

export interface FoldResult {
  final: FlatState;
  frames: StepFrame[];
  issues: FoldIssue[];
}

/* ------------------------------------------------------------------ */
/* Posed 3D model                                                     */
/* ------------------------------------------------------------------ */

export type PanelRole = 'center' | 'fuselage' | 'wing' | 'winglet';

/** Hinge rotation magnitudes, radians. See core/fold `finalHingeAngles` and `poseModel`. */
export interface HingeAngles {
  /** Rotation of each half about the centreline. 0 = flat, pi/2 = folded in half. */
  keel: number;
  /** Rotation of each wing about its wing line, measured back from the fuselage wall. 0 = in the wall plane, pi = flat against the outside. */
  wing: number;
  /** Rotation of each winglet about its line, signed: positive = up. */
  winglet: number;
}

/** A rigid, planar group of pieces. */
export interface Panel {
  index: number;
  role: PanelRole;
  /** -1 left, +1 right, 0 centre. */
  side: -1 | 0 | 1;
  /** A point on the panel plane, body frame. */
  origin: Vec3;
  /**
   * Unit normal, body frame: the image of body +y (up in the flat, un-hinged layout) under this panel's
   * hinge rotations. Wings and the centre panel: up. A vertical right fuselage wall: inboard (-z).
   */
  normal: Vec3;
  /**
   * Unit vector along which stacked layers are offset for rendering: the image of the table's
   * toward-viewer axis. Equals `normal` for a valley keel or none, `-normal` for a mountain keel.
   */
  stackDir: Vec3;
  pieceIds: number[];
}

export interface PosedPiece {
  id: number;
  panel: number;
  /** Body-frame vertices, zero thickness. Same order as `sheet`. */
  verts: Vec3[];
  /** Matching polygon in sheet coordinates (for colour / pattern lookup). */
  sheet: Vec2[];
  /** Unit normal of the paper's FRONT face in the body frame. */
  frontNormal: Vec3;
  /** Stacking rank inherited from the flat state. Offset a rendered piece by stackDir * layer * gap. */
  layer: number;
}

export interface PosedModel {
  paper: PaperSpec;
  angles: HingeAngles;
  pieces: PosedPiece[];
  panels: Panel[];
  /** Overall extents in the body frame, metres. */
  length: number;
  span: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* Airframe (physics-ready)                                           */
/* ------------------------------------------------------------------ */

/**
 * One thin flat-plate aerodynamic element: a spanwise strip of one panel.
 * Model: docs/research/01-aerodynamics.md section 10.
 */
export interface AeroElement {
  panel: number;
  role: PanelRole;
  side: -1 | 0 | 1;
  /** Index into Airframe.surfaces. */
  surface: number;
  /** Planform area of the element, m². */
  area: number;
  /** Local chord, metres. */
  chord: number;
  /** Leading-edge point of the element, body frame (origin at the tail, NOT the CG). */
  le: Vec3;
  /** Unit vector from the leading edge toward the trailing edge, in the element plane. */
  chordDir: Vec3;
  /** Unit normal of the element plane, body frame (same sense as its panel normal). */
  normal: Vec3;
  /** Fraction of the chord that is bent at the trailing edge (elevator / aileron / rudder). 0 = no bend. */
  bendFrac: number;
  /** Bend angle, radians. Positive = trailing edge bent toward +normal. */
  bendRad: number;
  /** Fraction of the normal force this element keeps when shielded by a twin surface (closed keel halves): 0.5 - 1. */
  exposure: number;
  /** Wetted faces for skin friction, 1 to 2. Fractional while a closed keel opens (one face each when pressed together). */
  wettedFaces: number;
}

/** A group of elements that shares one finite-wing correction. Coefficients per research doc 01 section 10.1. */
export interface LiftingSurface {
  role: PanelRole;
  /** Reference area, m². */
  area: number;
  /** Span used for the aspect ratio, metres. */
  span: number;
  aspectRatio: number;
  meanChord: number;
  /** 0 = rectangular / straight planform, 1 = slender delta. Blends the coefficient sets continuously. */
  deltaness: number;
  /** Potential-lift constant Kp, per radian. */
  kp: number;
  /** Vortex-lift constant Kv. */
  kv: number;
  /** Stall angle and blend width, radians. */
  alphaStall: number;
  stallWidth: number;
  /** Flat-plate drag coefficient at 90 degrees. */
  cd90: number;
  /** Centre-of-pressure base position as a fraction of chord at small incidence. */
  k0: number;
  /** Chord fraction where the vortex-lift part of the normal force acts (0.5 on straight wings and pure deltas). */
  vortexCp: number;
  /** Plain-flap efficiency eta_f applied to the bends of this surface's elements (research doc 01 section 8). */
  flapEfficiency: number;
  /**
   * How far the bend behaves as on a slender wing instead of a thin airfoil, 0 to 1 (research doc 01 section 8,
   * low-AR limit): at 1 the full bend angle counts (tau = 1) and its load sits at the hinge line; at 0 it is
   * the thin-airfoil flap.
   */
  flapSlenderness: number;
}

export interface Airframe {
  /** Total mass including ballast, kg. */
  mass: number;
  /** Centre of gravity, body frame (origin at the tail). */
  cg: Vec3;
  /** Inertia tensor about the CG, body axes, kg m². */
  inertia: Mat3;
  /**
   * Apparent (added) mass and inertia of the surrounding air, body axes. Added on the acceleration
   * side only (research doc 02 section 3). Zero matrices disable the effect.
   */
  apparentMass: Mat3;
  apparentInertia: Mat3;
  elements: AeroElement[];
  surfaces: LiftingSurface[];
  ref: {
    /** Projected wing area (wings + centre panel), m². */
    area: number;
    /** Tip-to-tip projected span, metres. */
    span: number;
    /** Mean aerodynamic chord, metres. */
    mac: number;
    /** Body x of the leading edge of the MAC. */
    macLeX: number;
    aspectRatio: number;
    /** Nose-to-tail length, metres. */
    length: number;
    /** Weight / area, N/m². */
    wingLoading: number;
  };
  /** CG position as a fraction of length measured from the NOSE (0 = nose, 1 = tail). */
  cgFromNose: number;
  /** Count of paper layers at the thickest point (for display). */
  maxLayers: number;
  /** Body-frame points used for ground / wall contact tests (nose, tail, wing tips, keel). */
  contactPoints: Vec3[];
}

/* ------------------------------------------------------------------ */
/* Air, wind, environments                                            */
/* ------------------------------------------------------------------ */

export interface Air {
  /** Density, kg/m³. */
  rho: number;
  /** Dynamic viscosity, Pa s. */
  mu: number;
}

/** A thermal updraft column (Allen scaling with the zero-net-flux game shape, research doc 03 section 5.2). */
export interface ThermalSpec {
  /** Centre on the ground plane (x, z) at t = 0, metres. The column leans and drifts with the mean wind U(z). */
  x: number;
  z: number;
  /** Convective velocity scale w*, m/s (about 1 - 1.5 on a sunny day). */
  wStar: number;
  /** Depth of the convective layer z_i, metres (about 1000). */
  mixedLayerHeight: number;
}

/** Turbulence given directly instead of from surface-layer similarity: room air. */
export interface TurbulenceSpec {
  /** Standard deviations [along the mean wind, across it, vertical], m/s. */
  sigma: Vec3;
  /** Correlation length of the gusts on every axis, metres (Ornstein-Uhlenbeck, research doc 03 section 3.5). */
  length: number;
}

/** The air's motion in one place. `createWindField` in core/wind turns it into a field. */
export interface WindSpec {
  /**
   * Mean wind speed, m/s. Outdoors (`roughness` > 0): the speed 10 m above the ground, U10.
   * Indoors (`roughness` = 0): the uniform room draft.
   */
  speed: number;
  /**
   * Direction the wind blows TOWARD, degrees, measured from +x toward +z. 0 = tailwind, 180 = headwind,
   * 90 = from the left. null = a horizontal direction drawn from the flight's seed (room drafts).
   */
  towardDeg: number | null;
  /** Aerodynamic roughness length z0, metres. 0 = no height profile (indoors). */
  roughness: number;
  /** Explicit turbulence, or null to derive it from `speed` and `roughness` (similarity theory, outdoors). */
  turbulence: TurbulenceSpec | null;
  /** Discrete gust events: 0 = none, 1 = strong and frequent. */
  gustiness: number;
  thermals: ThermalSpec[];
}

/**
 * Deterministic wind field. Same spec, seed and environment, same field. Air velocity in the world frame, m/s.
 *
 * `sample` is STATEFUL: the turbulence is a random process that advances along the path the samples trace.
 * Call it once per integrator step with a non-decreasing `t` and the plane's position. The result depends on
 * the seed and on the exact sequence of calls (positions and times); the same sequence gives the same
 * numbers. A repeated `t` does not advance the turbulence. `mean` is stateless and may be called freely.
 */
export interface WindField {
  /** Total air velocity (mean flow + gust events + turbulence). Written into `out` when given. */
  sample(pos: Vec3, t: number, out?: [number, number, number]): Vec3;
  /** The smooth part only (profile, terrain flow, thermals, gust events): a pure function of position and time. */
  mean(pos: Vec3, t: number, out?: [number, number, number]): Vec3;
}

export interface RoomBounds {
  /** World-frame box the plane may fly in; the floor is y = 0. Hitting a wall or the ceiling ends the flight. */
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  ceiling: number;
}

/**
 * Ground shape, uniform along z. The thrower stands at x = 0 where the ground is at y = 0.
 * `groundHeight` in core/env evaluates it; the wind field flows over it.
 */
export type Terrain =
  | { kind: 'flat' }
  | {
      /** An endless row of smooth cosine ridges (research doc 03 section 5.3 a). */
      kind: 'hill';
      /** Crest-to-valley height, metres. */
      height: number;
      /** Horizontal distance from a crest to the next valley floor, metres. */
      halfWidth: number;
      /** World x of the crest nearest the thrower. */
      crestX: number;
    }
  | {
      /**
       * A flat cliff top at y = 0 for x <= edgeX, a rounded face (quarter circle of radius `height`) and the
       * sea at y = -height from x = edgeX + height on (research doc 03 section 5.3 b).
       */
      kind: 'cliff';
      height: number;
      edgeX: number;
    };

/** Physical description of a place. Visual themes live in the UI layer and key off `id`. */
export interface Environment {
  id: string;
  name: string;
  blurb: string;
  indoor: boolean;
  /** null = open air. */
  bounds: RoomBounds | null;
  terrain: Terrain;
  tempC: number;
  pressurePa: number;
  /** Relative humidity, 0 - 1. */
  humidity: number;
  wind: WindSpec;
  /** Whether the player may change wind speed / direction / gustiness here. */
  adjustableWind: boolean;
  /** Maximum mean wind the UI allows, m/s. */
  maxWind: number;
  /** Release point of the throw (the plane's centre of gravity at release), world frame. */
  launch: Vec3;
}

/** Player-chosen overrides for one flight. */
export interface Conditions {
  envId: string;
  windSpeed?: number;
  windTowardDeg?: number;
  gustiness?: number;
}

/* ------------------------------------------------------------------ */
/* Flight simulation                                                  */
/* ------------------------------------------------------------------ */

export interface Launch {
  /** Release speed over the ground, m/s. */
  speed: number;
  /** Elevation of the velocity vector above the horizon, degrees. */
  pitchDeg: number;
  /** Heading of the velocity vector, degrees from +x toward +z. */
  yawDeg: number;
  /** Bank at release, degrees. Positive = right wing down. */
  rollDeg: number;
  /** Angle of attack at release, degrees (nose above the velocity vector, in the plane's own plane of symmetry). */
  aoaDeg: number;
}

export interface FlightSample {
  t: number;
  pos: Vec3;
  quat: Quat;
  /** World-frame velocity of the CG, m/s. */
  vel: Vec3;
  /** Body-frame angular velocity, rad/s. */
  omega: Vec3;
  /** Speed relative to the local air, m/s. */
  airspeed: number;
  /** Radians. */
  alpha: number;
  beta: number;
  /**
   * Whole-plane coefficients at this instant (reference area = airframe.ref.area): drag along the relative
   * wind, lift perpendicular to it in the plane of symmetry (the wind tunnel's axes). Zero below 0.2 m/s airspeed.
   */
  cl: number;
  cd: number;
  /** Local wind at the CG, world frame, m/s. */
  wind: Vec3;
}

/**
 *  launch   release, t = 0.
 *  apex     highest point of the centre of gravity (only when the plane climbed after release).
 *  stall    the whole-plane angle of attack rose past the wing's stall angle; `recover` when it fell 3 degrees below it.
 *  tumble   a full turn in roll, or a full turn in pitch during which the air came from behind (a loop is not a tumble).
 *  ground / wall / ceiling   first touch: the end of the flight. `timeout`: still airborne at the time limit.
 */
export type FlightEventKind = 'launch' | 'apex' | 'stall' | 'recover' | 'tumble' | 'ground' | 'wall' | 'ceiling' | 'timeout';

export interface FlightEvent {
  t: number;
  kind: FlightEventKind;
  /** Centre of gravity at that instant. For ground / wall / ceiling: the point of the plane that touched. */
  pos: Vec3;
}

export interface FlightMetrics {
  /** Horizontal straight-line distance from the release point to the point of first touch, metres. */
  distance: number;
  /** Component of that distance along the throw line (+x), metres. */
  downrange: number;
  /** Sideways drift (z), metres. */
  lateral: number;
  /** Time from release to first contact, seconds. */
  airtime: number;
  /** Highest world y of the centre of gravity, metres (the ground under the thrower is y = 0). */
  maxHeight: number;
  /** Highest speed over the ground, m/s. */
  maxSpeed: number;
  /** Time average of the speed through the air, m/s. */
  meanAirspeed: number;
  /** Length of the flight path, metres. */
  pathLength: number;
  /**
   * Horizontal distance / height lost, both through the air, over the longest steady stretch of the flight
   * (at least 0.5 s with airspeed and flight-path angle nearly constant); null if there is none.
   */
  glideRatio: number | null;
  /** Mean sink rate through the air over that stretch, m/s; null if none. */
  sinkRate: number | null;
  /** Mean angle of attack over that segment, radians. */
  glideAlpha: number | null;
  glideSpeed: number | null;
  stallCount: number;
  /** Speed at touchdown, m/s. */
  landingSpeed: number;
  /** Chord Reynolds number at the mean airspeed. */
  reynolds: number;
}

export type DiagnosisCode =
  | 'clean-glide'
  | 'nose-dive'
  | 'stall-mush'
  | 'porpoise'
  | 'loop'
  | 'spiral'
  | 'roll-off'
  | 'tumble'
  | 'wind-carried'
  | 'hit-wall'
  | 'hit-ceiling'
  | 'too-slow'
  | 'ballistic';

export interface Diagnosis {
  code: DiagnosisCode;
  /** One-sentence plain-language description of what happened. */
  what: string;
  /** Why it happened, in physical terms. */
  why: string;
  /** What to change (trim, throw, design). Empty for clean flights. */
  fix: string;
}

export interface FlightResult {
  seed: number;
  /** Integration step, seconds. */
  dt: number;
  /** Output rate of `samples`, Hz. */
  sampleHz: number;
  /** One sample every 1 / sampleHz seconds from t = 0, plus a last one at the exact instant the flight ended. */
  samples: FlightSample[];
  events: FlightEvent[];
  metrics: FlightMetrics;
  diagnosis: Diagnosis[];
  outcome: 'ground' | 'wall' | 'ceiling' | 'timeout';
}

/* ------------------------------------------------------------------ */
/* Wind tunnel                                                        */
/* ------------------------------------------------------------------ */

export interface PolarPoint {
  alphaDeg: number;
  cl: number;
  cd: number;
  /** Pitching-moment coefficient about the CG, reference chord = MAC. Positive = nose up. */
  cm: number;
  ld: number;
}

export interface TunnelReading {
  speed: number;
  alphaDeg: number;
  betaDeg: number;
  /** Forces in newtons, wind axes. */
  lift: number;
  drag: number;
  side: number;
  /** Moments about the CG, body axes, N m: [roll, yaw, pitch] = [about x, about y, about z]. */
  moment: Vec3;
  cl: number;
  cd: number;
  cm: number;
  reynolds: number;
  /** Chordwise position of the centre of pressure as body x, metres from the tail; null when the normal force is ~0. */
  cpX: number | null;
}

export interface TrimAnalysis {
  /** True when a stable equilibrium glide exists below the stall. */
  trimmable: boolean;
  alphaDeg: number | null;
  cl: number | null;
  /** Equilibrium glide speed, m/s. */
  speed: number | null;
  glideRatio: number | null;
  sinkRate: number | null;
  /** Body x of the neutral point, metres from the tail. */
  neutralPointX: number;
  /** (x_cg - x_np) / MAC as a percentage. Positive = CG ahead of the neutral point = stable. */
  staticMarginPct: number;
  pitchStable: boolean;
  /**
   * Roll-moment coefficient (about body +x, reference span) per radian of sideslip.
   * NEGATIVE is the stabilising dihedral effect: wind from the right lifts the right wing. `rollStable` = clBeta < 0.
   */
  clBeta: number;
  /**
   * Yaw-moment coefficient (about body +y, which points UP, reference span) per radian of sideslip.
   * NEGATIVE is weathercock stable in this frame (a positive rotation about +y yaws the nose left, away from
   * a wind from the right), the opposite sign of the textbook z-down convention. `yawStable` = cnBeta < 0.
   */
  cnBeta: number;
  rollStable: boolean;
  yawStable: boolean;
  /**
   * Directional stiffness in flight, "Cn-beta dynamic": -cnBeta cos(alpha) - (I_yaw / I_roll) clBeta sin(alpha).
   * POSITIVE is stable. Slender planes with a long keel are often not weathercock stable (cnBeta > 0) and hold
   * their heading through the dihedral effect instead; this number shows it.
   */
  cnBetaDynamic: number;
  /** Best lift-to-drag ratio in the sweep and where it occurs. */
  bestLd: number;
  bestLdAlphaDeg: number;
  stallAlphaDeg: number;
}

/* ------------------------------------------------------------------ */
/* Similarity ("which known plane is this?")                          */
/* ------------------------------------------------------------------ */

export interface Fingerprint {
  /** Top-view occupancy grid, GRID x GRID, row-major, values 0..1 (layer-count weighted, normalised). */
  grid: number[];
  /** Scale-free scalar features. */
  aspectRatio: number;
  cgFromNose: number;
  /** Wing area / sheet area. */
  areaRatio: number;
  /** Fuselage depth / length. */
  keelDepthRatio: number;
  /** Span / length. */
  slenderness: number;
}

export interface SimilarityMatch {
  id: string;
  name: string;
  /** 0..1 */
  score: number;
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                        */
/* ------------------------------------------------------------------ */

export type RankCategory = 'distance' | 'airtime';

/** A leaderboard is one (category, arena) pair flown under fixed, published conditions. */
export interface Arena {
  id: string;
  name: string;
  envId: string;
  /** Fixed conditions for ranked throws. */
  conditions: Conditions;
  /** Upper bound on release speed for ranked throws, m/s. */
  maxThrowSpeed: number;
  blurb: string;
}

/** Everything needed to replay and verify a ranked flight. */
export interface FlightTicket {
  design: PlaneDesign;
  launch: Launch;
  conditions: Conditions;
  seed: number;
}

export interface RankEntry {
  id: string;
  category: RankCategory;
  arenaId: string;
  player: string;
  planeName: string;
  /** Canonical hash of the folded geometry: equal hashes = the same airplane. */
  designHash: string;
  presetId?: string;
  paperSizeId: string;
  /** Metres for distance, seconds for airtime. */
  score: number;
  createdAt: string;
  /** 'house' entries are the lab's own reference flights of the preset planes. */
  origin: 'house' | 'local' | 'global';
  ticket: FlightTicket;
}

export interface RankQuery {
  category: RankCategory;
  arenaId: string;
  limit?: number;
  designHash?: string;
}

export interface LeaderboardStore {
  top(query: RankQuery): Promise<RankEntry[]>;
  submit(entry: Omit<RankEntry, 'id' | 'createdAt' | 'origin'>): Promise<RankEntry>;
}
