/**
 * Per-surface aerodynamic constants: docs/research/01-aerodynamics.md section 10.1.
 * Everything here is a pure function of aspect ratio and "deltaness", so the constants move continuously
 * when a fold line is dragged.
 */
import { clamp, DEG, lerp, smoothstep } from '../math';

/** Leading-edge sweep below which a surface is treated as straight, and above which as a slender delta (task brief; doc 01 section 10.1 gives the delta set for sweep >= 60 deg). */
export const DELTA_SWEEP_START = 35 * DEG;
export const DELTA_SWEEP_FULL = 60 * DEG;

/** Rectangular vortex-lift constant at AR <= 1 (doc 01 section 3, calibration). */
const KV_RECT_MAX = 2.3;
/** Aspect ratio above which a straight wing has no vortex lift (doc 01 section 3, [S9]). */
const KV_RECT_AR_END = 3;
/** Vortex-lift constant of a slender delta (doc 01 section 3, Polhamus). */
const KV_DELTA = Math.PI;
/** Stall angle: min(45, 9 + 26 exp(1 - AR)) degrees (doc 01 section 10.1, calibration). */
const STALL_MAX = 45 * DEG;
const STALL_BASE = 9 * DEG;
const STALL_GAIN = 26 * DEG;
/** Stall blend width, straight wings: 4 + 6 clamp((3 - AR) / 2, 0, 1.25) degrees (doc 01 section 10.1). */
const STALL_WIDTH_BASE = 4 * DEG;
const STALL_WIDTH_GAIN = 6 * DEG;
const STALL_WIDTH_CLAMP = 1.25;
/** Stall blend width, deltas (doc 01 section 10.1, changed in verification). */
const STALL_WIDTH_DELTA = 20 * DEG;
/** Normal-plate drag: max(1.17, 1.11 + 0.018 max(AR, 1/AR)) (doc 01 section 5, Viterna [S20]). */
const CD90_MIN = 1.17;
const CD90_BASE = 1.11;
const CD90_SLOPE = 0.018;
/** Centre of pressure at small incidence, fraction of chord (doc 01 section 6). */
export const K0_RECT = 0.25;
/** Value for a pure delta: puts the aerodynamic centre at 2/3 of the root chord, the slender-wing result (doc 01 section 6). */
export const K0_DELTA = 0.5;
/** Vortex lift acts at mid-chord on straight wings: side-edge vortices (doc 01 section 6, calibration). */
const VORTEX_CP_RECT = 0.5;
/** Viscous plain-flap efficiency eta_f (doc 01 section 8, calibration). */
export const FLAP_EFFICIENCY = 0.8;

const AR_FLOOR = 1e-3;

/** Helmbold lift slope of a straight wing, per radian (doc 01 section 3, [S8]). */
export const helmboldSlope = (ar: number): number => (2 * Math.PI * ar) / (2 + Math.sqrt(ar * ar + 4));

/**
 * Lowry-Polhamus / DATCOM lift slope of a delta (taper 0), per radian. With tan(half-chord sweep) = 2 / AR
 * the sweep term AR² tan² becomes the constant 4 (doc 01 section 3).
 */
export const deltaSlope = (ar: number): number => (2 * Math.PI * ar) / (2 + Math.sqrt(ar * ar + 8));

/** 0 for straight leading edges, 1 for slender deltas, smooth in between. */
export const deltanessFromSweep = (sweepRad: number): number =>
  smoothstep(DELTA_SWEEP_START, DELTA_SWEEP_FULL, sweepRad);

export interface SurfaceCoefficients {
  deltaness: number;
  kp: number;
  kv: number;
  alphaStall: number;
  stallWidth: number;
  cd90: number;
  k0: number;
  vortexCp: number;
  flapEfficiency: number;
}

/**
 * The constants of doc 01 section 10.1, blended between the straight and the delta set by `deltaness`.
 *
 * `deltaCp` is the strip centre-of-pressure fraction of the delta set. Doc 01 section 6 derives 0.5 for a
 * pure delta from one requirement: uniformly loaded strips must put the aerodynamic centre where slender-wing
 * theory puts it. The caller passes the value that meets the same requirement for the actual planform
 * (`slenderCpFraction`); it is 0.5 for a pure delta and smaller when the tips are cropped. On a delta the
 * vortex lift is taken to act at the same fraction (conical flow), on a straight wing at mid-chord.
 */
export function surfaceCoefficients(aspectRatio: number, deltaness: number, deltaCp: number = K0_DELTA): SurfaceCoefficients {
  const ar = Math.max(aspectRatio, AR_FLOOR);
  const d = clamp(deltaness, 0, 1);
  const lowAr = (KV_RECT_AR_END - ar) / 2;
  return {
    deltaness: d,
    kp: lerp(helmboldSlope(ar), deltaSlope(ar), d),
    kv: lerp(KV_RECT_MAX * clamp(lowAr, 0, 1), KV_DELTA, d),
    alphaStall: Math.min(STALL_MAX, STALL_BASE + STALL_GAIN * Math.exp(1 - ar)),
    stallWidth: lerp(STALL_WIDTH_BASE + STALL_WIDTH_GAIN * clamp(lowAr, 0, STALL_WIDTH_CLAMP), STALL_WIDTH_DELTA, d),
    cd90: Math.max(CD90_MIN, CD90_BASE + CD90_SLOPE * Math.max(ar, 1 / ar)),
    k0: lerp(K0_RECT, deltaCp, d),
    vortexCp: lerp(VORTEX_CP_RECT, deltaCp, d),
    flapEfficiency: FLAP_EFFICIENCY,
  };
}

/**
 * Strip centre-of-pressure fraction that makes uniformly loaded strips reproduce the slender-wing aerodynamic
 * centre of a planform. Slender-wing theory (R. T. Jones) loads a wing in proportion to d(s²)/dx, s(x) being
 * the local semi-span going aft, so its aerodynamic centre is the centroid of the growth of s².
 * Each strip is given by its leading-edge x, its chord, the distance of its outer edge from the centreline
 * and its projected area. Result clamped to [0.25, 0.5]: quarter chord (thin airfoil) to the pure-delta value.
 */
export function slenderCpFraction(
  strips: readonly { leX: number; chord: number; outer: number; area: number }[],
): number {
  let area = 0;
  let leSum = 0;
  let chordSum = 0;
  for (const s of strips) {
    area += s.area;
    leSum += s.area * s.leX;
    chordSum += s.area * s.chord;
  }
  if (!(area > 0) || !(chordSum > 0)) return K0_DELTA;
  // March aft from the nose; the span grows where a strip begins.
  const order = [...strips].sort((a, b) => b.leX - a.leX);
  let reach = 0;
  let growth = 0;
  let moment = 0;
  for (const s of order) {
    if (s.outer <= reach) continue;
    const step = s.outer * s.outer - reach * reach;
    growth += step;
    moment += step * s.leX;
    reach = s.outer;
  }
  if (!(growth > 0)) return K0_DELTA;
  const centre = moment / growth;
  // Sum of area (leX - k chord) = centre * area  =>  k = (mean leX - centre) / mean chord.
  return clamp((leSum / area - centre) / (chordSum / area), K0_RECT, K0_DELTA);
}

/** Linear blend of two coefficient sets: t = 0 gives `a`, t = 1 gives `b`. */
export function blendCoefficients(a: SurfaceCoefficients, b: SurfaceCoefficients, t: number): SurfaceCoefficients {
  return {
    deltaness: lerp(a.deltaness, b.deltaness, t),
    kp: lerp(a.kp, b.kp, t),
    kv: lerp(a.kv, b.kv, t),
    alphaStall: lerp(a.alphaStall, b.alphaStall, t),
    stallWidth: lerp(a.stallWidth, b.stallWidth, t),
    cd90: lerp(a.cd90, b.cd90, t),
    k0: lerp(a.k0, b.k0, t),
    vortexCp: lerp(a.vortexCp, b.vortexCp, t),
    flapEfficiency: lerp(a.flapEfficiency, b.flapEfficiency, t),
  };
}

/**
 * Added-mass coefficient of a rectangular plate moving broadside, by the ratio long side / short side
 * (doc 01 section 7, DNV-RP-H103-type table). Beyond the table it follows 1 - 0.5 / ratio, which meets
 * the last entry (0.90 at 5) and tends to the strip value 1.
 */
const CA_TABLE = [0.58, 0.76, 0.83, 0.87, 0.9];

export function plateAddedMassCoefficient(ratio: number): number {
  const r = Math.max(ratio, 1);
  if (r >= CA_TABLE.length) return 1 - 0.5 / r;
  const i = Math.floor(r) - 1;
  return lerp(CA_TABLE[i], CA_TABLE[i + 1], r - 1 - i);
}

/**
 * Broadside added mass of a plate with the given span and mean chord, kg (doc 01 section 7, corrected rule):
 * rho C_A pi a² l / 4 with a the SHORTER and l the longer side.
 */
export function plateAddedMass(rho: number, span: number, meanChord: number): number {
  const a = Math.min(span, meanChord);
  const l = Math.max(span, meanChord);
  if (!(a > 0)) return 0;
  return (rho * plateAddedMassCoefficient(l / a) * Math.PI * a * a * l) / 4;
}
