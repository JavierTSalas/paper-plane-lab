/**
 * Quasi-steady thin flat-plate element aerodynamics.
 * Model: docs/research/01-aerodynamics.md section 10.2 (see the notes on `elementLoad` for the two places
 * where a step function of the pseudocode is replaced by a continuous factor).
 */
import type { Air, Airframe, Vec3 } from '../types';
import { flapCmDelta, flapTau } from './flap';

// The model constants live in this file as plain module constants: the element kernel runs millions of
// times per second and must not reach them through an import binding.

/** Laminar skin friction on both faces, Blasius: 2 x 1.328 / sqrt(Re) (doc 01 section 4, [S34]). */
const BLASIUS_BOTH_FACES = 2.656;
/** Edge and bubble drag added to the friction coefficient (doc 01 section 4, calibration). */
const EDGE_DRAG = 0.006;
/** Reynolds number below which the friction coefficient is held (doc 01 section 10.2). */
const RE_FLOOR = 1e3;
/** Bluff-plate normal-force shape sin a / (0.56 + 0.44 sin a): Kirchhoff-Rayleigh rescaled (doc 01 section 5). */
const PLATE_SHAPE_A = 0.56;
const PLATE_SHAPE_B = 0.44;
/** Incidence is evaluated a quarter chord behind mid-chord: the 3/4-chord point (doc 01 section 10.2, Pistolesi). */
const EVAL_AFT_OF_MID = 0.25;
/**
 * The upstream-edge switch of doc 01 section 10.2 is faded over chordwise speeds below this fraction of the
 * flight speed (design choice for continuity; the document itself smooths the force point the same way).
 */
const UPSTREAM_FADE = 0.05;

/** Force and moment about the CG, body frame, N and N m. Mutable so that callers can reuse one object. */
export interface AeroLoads {
  force: [number, number, number];
  moment: [number, number, number];
}

export const createAeroLoads = (): AeroLoads => ({ force: [0, 0, 0], moment: [0, 0, 0] });

/* ---- compiled airframe: element data relative to the CG in one flat typed array ---- */

const RX = 0; // mid-chord point from the CG (3)
const EX = 3; // unit chord vector toward the leading edge (3)
const NX = 6; // unit normal (3)
const AREA = 9;
const CHORD = 10;
const EXPOSURE = 11;
const FRICTION = 12; // wetted faces / 2
const BEND_SIN = 13; // sin(eta_f tau(E) delta): sine of the incidence shift of the bend
const BEND_MOMENT = 14; // -Cm_delta delta eta_f (Kp / 2 pi) S c exposure: bend moment per unit dynamic pressure
const AX = 15; // bend moment axis, chord x normal (3)
const KP = 18;
const KV = 19;
const SIN_STALL = 20; // sin(alpha_s)
const ALPHA_STALL = 21;
const INV_WIDTH = 22; // 1 / stall blend width
const SIN_FULL = 23; // sin(alpha_s + width): fully separated from here on
const CD90 = 24;
const K0 = 25;
const VORTEX_CP = 26; // chord fraction where the vortex lift acts
const BEND_COS_LESS_ONE = 27; // cos(incidence shift of the bend) - 1
const STRIDE = 28;

interface Compiled {
  count: number;
  data: Float64Array;
}

/** Largest incidence shift a bend may produce, radians: keeps the shifted angle inside the model's range. */
const MAX_BEND_SHIFT = 1.2;

function compile(airframe: Airframe): Compiled {
  const count = airframe.elements.length;
  const data = new Float64Array(count * STRIDE);
  const cg = airframe.cg;
  airframe.elements.forEach((e, i) => {
    const o = i * STRIDE;
    const s = airframe.surfaces[e.surface];
    const ex = -e.chordDir[0];
    const ey = -e.chordDir[1];
    const ez = -e.chordDir[2];
    const [nx, ny, nz] = e.normal;
    // Mid-chord point = leading edge + half a chord toward the trailing edge.
    data[o + RX] = e.le[0] - 0.5 * e.chord * ex - cg[0];
    data[o + RX + 1] = e.le[1] - 0.5 * e.chord * ey - cg[1];
    data[o + RX + 2] = e.le[2] - 0.5 * e.chord * ez - cg[2];
    data[o + EX] = ex;
    data[o + EX + 1] = ey;
    data[o + EX + 2] = ez;
    data[o + NX] = nx;
    data[o + NX + 1] = ny;
    data[o + NX + 2] = nz;
    data[o + AREA] = e.area;
    data[o + CHORD] = e.chord;
    data[o + EXPOSURE] = e.exposure;
    data[o + FRICTION] = e.wettedFaces / 2;
    if (e.bendFrac > 0 && e.bendRad !== 0) {
      const shift = s.flapEfficiency * flapTau(e.bendFrac) * e.bendRad;
      const limited = Math.max(-MAX_BEND_SHIFT, Math.min(MAX_BEND_SHIFT, shift));
      data[o + BEND_SIN] = Math.sin(limited);
      data[o + BEND_COS_LESS_ONE] = Math.cos(limited) - 1;
      data[o + BEND_MOMENT] =
        -flapCmDelta(e.bendFrac) * e.bendRad * s.flapEfficiency * (s.kp / (2 * Math.PI)) * e.area * e.chord * e.exposure;
    }
    data[o + AX] = ey * nz - ez * ny;
    data[o + AX + 1] = ez * nx - ex * nz;
    data[o + AX + 2] = ex * ny - ey * nx;
    data[o + KP] = s.kp;
    data[o + KV] = s.kv;
    data[o + SIN_STALL] = Math.sin(s.alphaStall);
    data[o + ALPHA_STALL] = s.alphaStall;
    data[o + INV_WIDTH] = 1 / Math.max(s.stallWidth, 1e-6);
    data[o + SIN_FULL] = Math.sin(Math.min(s.alphaStall + s.stallWidth, Math.PI / 2));
    data[o + CD90] = s.cd90;
    data[o + K0] = s.k0;
    data[o + VORTEX_CP] = s.vortexCp;
  });
  return { count, data };
}

const cache = new WeakMap<Airframe, Compiled>();

/** Compiled form of an airframe, built on first use. Airframes are immutable once built. */
function compiled(airframe: Airframe): Compiled {
  let c = cache.get(airframe);
  if (!c) {
    c = compile(airframe);
    cache.set(airframe, c);
  }
  return c;
}

/* ---- per-element kernel ---- */

// Result slots of one element evaluation.
const FX = 0; // total force (3)
const MX = 3; // total moment about the CG (3)
const PX = 6; // point where the normal force acts, from the CG (3)
const NORMAL_FORCE = 9; // signed normal force along +n, newtons
const SIN_INCIDENCE = 10; // signed sine of the effective incidence (bend included)
const SEPARATION = 11; // stall blend, 0 attached .. 1 separated
const CN = 12;
const DYN_PRESSURE = 13;
const REYNOLDS = 14;
const FRICTION_X = 15; // friction force (3)
const RESULT_SIZE = 18;

const result = new Float64Array(RESULT_SIZE);
/** Running sum of force (3) and moment about the CG (3) over the elements of one evaluation. */
const total = new Float64Array(6);

/** Speeds below this give no force, m/s. Also keeps divisions finite. */
const MIN_SPEED = 1e-6;
/** Keeps 0 / 0 at zero: far below any squared speed (m²/s²) or force coefficient that matters. */
const EPS = 1e-12;

/**
 * Loads of one element (doc 01 section 10.2), added to `total`; with `detail` also written to `result`.
 *
 *  - velocity through the air at the 3/4-chord point measured from the upstream edge;
 *  - signed incidence against the plate plane from the normal and the full in-plane speed;
 *  - bend: incidence shift eta_f tau(E) delta and the thin-airfoil bend moment, blended out by the stall;
 *  - CN: potential + vortex term, smoothstep blend into the bluff-plate curve;
 *  - friction on the in-plane velocity; normal force at the centre of pressure, friction at mid-chord.
 *
 * The pseudocode switches on the sign of the chordwise velocity vx in two places: which 3/4-chord point is
 * used, and whether the bend terms act. Here both fade linearly while |vx| is below UPSTREAM_FADE times the
 * flight speed (`ramp` = 1 / that speed), so the loads stay continuous when a strip slides sideways or
 * tumbles. Outside that narrow band the result is exactly the pseudocode.
 */
function elementLoad(
  d: Float64Array, o: number,
  vx: number, vy: number, vz: number,
  wx: number, wy: number, wz: number,
  rho: number, rhoOverMu: number, ramp: number,
  detail: boolean,
): void {
  const rx = d[o + RX];
  const ry = d[o + RX + 1];
  const rz = d[o + RX + 2];
  const ex = d[o + EX];
  const ey = d[o + EX + 1];
  const ez = d[o + EX + 2];
  const nx = d[o + NX];
  const ny = d[o + NX + 1];
  const nz = d[o + NX + 2];
  const chord = d[o + CHORD];

  // Velocity of the mid-chord point through the air.
  let ux = vx + wy * rz - wz * ry;
  let uy = vy + wz * rx - wx * rz;
  let uz = vz + wx * ry - wy * rx;
  // Chordwise component, positive when the leading edge is upstream. It is the same at every point of the
  // chord line, because omega x (chord axis) has no chordwise part.
  const ue = ux * ex + uy * ey + uz * ez;
  // Which edge is upstream: +1 leading edge, -1 trailing edge, faded linearly through zero.
  const edge = ue * ramp;
  const upstream = edge > 1 ? 1 : edge < -1 ? -1 : edge;
  const lead = upstream > 0 ? upstream : 0;
  // Move to the 3/4-chord point from the upstream edge: r_eval = r_mid - 0.25 c upstream x.
  const back = -EVAL_AFT_OF_MID * chord * upstream;
  ux += back * (wy * ez - wz * ey);
  uy += back * (wz * ex - wx * ez);
  uz += back * (wx * ey - wy * ex);
  const u2 = ux * ux + uy * uy + uz * uz;
  if (u2 < MIN_SPEED * MIN_SPEED) {
    if (detail) result.fill(0);
    return;
  }
  const un = ux * nx + uy * ny + uz * nz;
  const speed = Math.sqrt(u2);
  const ut = Math.sqrt(Math.max(u2 - un * un, 0));
  const invSpeed = 1 / speed;
  // Chordwise direction cosine of the in-plane flow.
  const cx = ue / (ut + EPS);

  // Signed incidence against the plate plane, as sine and cosine. un > 0: the air strikes the +n face.
  let sinA = un * invSpeed;
  let cosA = ut * invSpeed;
  const bendSin = d[o + BEND_SIN];
  if (bendSin !== 0 && lead > 0) {
    // Rotate by the bend's incidence shift, faded in linearly with `lead`.
    const cosLess = d[o + BEND_COS_LESS_ONE];
    const s2 = sinA + lead * (sinA * cosLess + cosA * bendSin);
    const c2 = cosA + lead * (cosA * cosLess - sinA * bendSin);
    if (c2 < 0) {
      // Shifted past 90 degrees: the incidence saturates there.
      sinA = s2 < 0 ? -1 : 1;
      cosA = 0;
    } else {
      sinA = s2;
      cosA = c2;
    }
  }
  const sign = sinA < 0 ? -1 : 1;
  const sp = sinA * sign;

  // Stall blend: 0 attached, 1 separated (smoothstep in the incidence angle).
  let sep = 0;
  if (sp > d[o + SIN_STALL]) {
    if (sp >= d[o + SIN_FULL]) {
      sep = 1;
    } else {
      const t = (Math.asin(sp) - d[o + ALPHA_STALL]) * d[o + INV_WIDTH];
      sep = t >= 1 ? 1 : t * t * (3 - 2 * t);
    }
  }

  const cnPotential = d[o + KP] * sp * cosA;
  const cnVortex = d[o + KV] * sp * sp;
  const attached = cnPotential + cnVortex;
  const plate = (d[o + CD90] * sp) / (PLATE_SHAPE_A + PLATE_SHAPE_B * sp);
  const cn = (1 - sep) * attached + sep * plate;

  const k0 = d[o + K0];
  const xp = k0 + (0.5 - k0) * sp;
  const xcp = ((1 - sep) * (cnPotential * xp + cnVortex * d[o + VORTEX_CP])) / (attached + EPS) + sep * xp;

  const area = d[o + AREA];
  const q = 0.5 * rho * u2;
  const fn = -sign * q * area * cn * d[o + EXPOSURE];

  // Normal force at the centre of pressure, x_cp chords behind the upstream edge.
  const arm = (0.5 - xcp) * chord * cx;
  const px = rx + arm * ex;
  const py = ry + arm * ey;
  const pz = rz + arm * ez;
  const fnx = fn * nx;
  const fny = fn * ny;
  const fnz = fn * nz;

  // Skin friction on the in-plane velocity, at mid-chord.
  const re = rhoOverMu * speed * chord;
  const cf = BLASIUS_BOTH_FACES / Math.sqrt(re > RE_FLOOR ? re : RE_FLOOR) + EDGE_DRAG;
  const kt = -0.5 * rho * area * cf * speed * d[o + FRICTION];
  const ftx = kt * (ux - un * nx);
  const fty = kt * (uy - un * ny);
  const ftz = kt * (uz - un * nz);

  // Thin-airfoil bend moment about the span axis (chord x normal).
  const mb = d[o + BEND_MOMENT] * q * (1 - sep) * lead;

  const fx = fnx + ftx;
  const fy = fny + fty;
  const fz = fnz + ftz;
  const mx = py * fnz - pz * fny + ry * ftz - rz * fty + mb * d[o + AX];
  const my = pz * fnx - px * fnz + rz * ftx - rx * ftz + mb * d[o + AX + 1];
  const mz = px * fny - py * fnx + rx * fty - ry * ftx + mb * d[o + AX + 2];
  total[0] += fx;
  total[1] += fy;
  total[2] += fz;
  total[3] += mx;
  total[4] += my;
  total[5] += mz;
  if (!detail) return;
  result[FX] = fx;
  result[FX + 1] = fy;
  result[FX + 2] = fz;
  result[MX] = mx;
  result[MX + 1] = my;
  result[MX + 2] = mz;
  result[PX] = px;
  result[PX + 1] = py;
  result[PX + 2] = pz;
  result[NORMAL_FORCE] = fn;
  result[SIN_INCIDENCE] = sinA;
  result[SEPARATION] = sep;
  result[CN] = cn;
  result[DYN_PRESSURE] = q;
  result[REYNOLDS] = re;
  result[FRICTION_X] = ftx;
  result[FRICTION_X + 1] = fty;
  result[FRICTION_X + 2] = ftz;
}

/**
 * Aerodynamic force and moment about the CG, body frame.
 *
 * @param vRelBody  velocity of the CG relative to the local air, body frame, m/s. One wind vector for the
 *                  whole plane (the span is much smaller than the turbulence scale, research doc 03).
 * @param omegaBody body-frame angular velocity, rad/s. Rate damping comes from omega x r at every element.
 * @param out       receives the result; nothing is allocated.
 */
export function aeroLoads(airframe: Airframe, vRelBody: Vec3, omegaBody: Vec3, air: Air, out: AeroLoads): void {
  const c = compiled(airframe);
  const d = c.data;
  const vx = vRelBody[0];
  const vy = vRelBody[1];
  const vz = vRelBody[2];
  const wx = omegaBody[0];
  const wy = omegaBody[1];
  const wz = omegaBody[2];
  const rho = air.rho;
  const rhoOverMu = air.rho / air.mu;
  const ramp = 1 / (UPSTREAM_FADE * Math.sqrt(vx * vx + vy * vy + vz * vz) + MIN_SPEED);
  total.fill(0);
  const end = c.count * STRIDE;
  for (let o = 0; o < end; o += STRIDE) elementLoad(d, o, vx, vy, vz, wx, wy, wz, rho, rhoOverMu, ramp, false);
  out.force[0] = total[0];
  out.force[1] = total[1];
  out.force[2] = total[2];
  out.moment[0] = total[3];
  out.moment[1] = total[4];
  out.moment[2] = total[5];
}

/** What one element does at one instant, for the wind-tunnel view and for debugging. */
export interface ElementLoad {
  /** Index into Airframe.elements. */
  index: number;
  /** Total force on the element (normal force + friction), body frame, N. */
  force: Vec3;
  /** Pressure force, along the element normal, N. */
  normalForce: Vec3;
  /** Skin-friction force, in the element plane, N. */
  friction: Vec3;
  /** Moment of the element about the CG, body frame, N m (bend moment included). */
  moment: Vec3;
  /** Centre of pressure: where the normal force acts, body frame with the origin at the tail. */
  cp: Vec3;
  /** Signed incidence against the element plane, bend shift included, radians. Positive: air strikes the +normal face. */
  incidence: number;
  /** Stall blend: 0 attached flow, 1 fully separated. */
  separation: number;
  /** Normal-force coefficient of the element (magnitude, before shielding). */
  cn: number;
  /** Dynamic pressure at the element, Pa. */
  dynamicPressure: number;
  /** Chord Reynolds number of the element. */
  reynolds: number;
}

export interface AeroLoadsDetail extends AeroLoads {
  elements: ElementLoad[];
}

/** Same physics as `aeroLoads` (same kernel), with the per-element breakdown. Allocates; not for the integrator. */
export function aeroLoadsDetailed(airframe: Airframe, vRelBody: Vec3, omegaBody: Vec3, air: Air): AeroLoadsDetail {
  const c = compiled(airframe);
  const d = c.data;
  const cg = airframe.cg;
  const rhoOverMu = air.rho / air.mu;
  const [vx, vy, vz] = vRelBody;
  const [wx, wy, wz] = omegaBody;
  const ramp = 1 / (UPSTREAM_FADE * Math.sqrt(vx * vx + vy * vy + vz * vz) + MIN_SPEED);
  const elements: ElementLoad[] = [];
  total.fill(0);
  for (let i = 0; i < c.count; i++) {
    const o = i * STRIDE;
    elementLoad(d, o, vx, vy, vz, wx, wy, wz, air.rho, rhoOverMu, ramp, true);
    const fn = result[NORMAL_FORCE];
    elements.push({
      index: i,
      force: [result[FX], result[FX + 1], result[FX + 2]],
      normalForce: [fn * d[o + NX], fn * d[o + NX + 1], fn * d[o + NX + 2]],
      friction: [result[FRICTION_X], result[FRICTION_X + 1], result[FRICTION_X + 2]],
      moment: [result[MX], result[MX + 1], result[MX + 2]],
      cp: [result[PX] + cg[0], result[PX + 1] + cg[1], result[PX + 2] + cg[2]],
      incidence: Math.asin(Math.max(-1, Math.min(1, result[SIN_INCIDENCE]))),
      separation: result[SEPARATION],
      cn: result[CN],
      dynamicPressure: result[DYN_PRESSURE],
      reynolds: result[REYNOLDS],
    });
  }
  return { force: [total[0], total[1], total[2]], moment: [total[3], total[4], total[5]], elements };
}
