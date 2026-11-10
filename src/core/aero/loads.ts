/**
 * Quasi-steady thin flat-plate element aerodynamics.
 * Model: docs/research/01-aerodynamics.md section 10.2. The notes on `accumulate` and `bendTerms` list the
 * places where this file goes beyond the document's pseudocode, and why.
 */
import type { Air, Airframe, LiftingSurface, Vec3 } from '../types';
import { flapCmDelta, flapTau } from './flap';

// The model constants live in this file as plain module constants: the element loop runs millions of
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
const BEND_MOMENT = 14; // bend moment per unit dynamic pressure: Kp eta_f tau delta (offset of the bend's load) S c exposure
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
const RXN = 28; // mid-chord point x normal (3): moment of a unit normal force at mid-chord
const SLIP = 31; // sideslip loading factor: 2 pi x slender weight, signed by the side of the plane (0 off the wings)
const STRIDE = 32;

interface Compiled {
  count: number;
  data: Float64Array;
}

/**
 * Sideslip loading of a slender wing (roll due to sideslip, the "dihedral effect" of sweep).
 *
 * Slender-wing theory (R. T. Jones' cross-flow argument, the theory `slenderCpFraction` already uses for the
 * centre of pressure) treats every cross-section as a flat plate of semi-span s(x) in a cross-flow with the
 * normal speed w = V sin(alpha) and the lateral speed v = V sin(beta). Because the two edges of a swept wing
 * then grow at unequal rates, the plate carries, besides its lift, an antisymmetric load
 *   dp(eta) = -2 rho w v eta / sqrt(s^2 - eta^2)          (eta: lateral position, positive to leeward)
 * with no net force and the rolling couple pi rho w v s(x)^2 per unit length, which raises the WINDWARD wing.
 * Over the planform that is M = pi rho w v * integral of s^2 dx, and since the integral of s^2 dx equals the
 * sum of |z| dA over the planform, the same couple comes from a uniform extra pressure of +-pi rho w v on the
 * windward / leeward half. For a delta: Cl_beta = -(pi / 3) alpha, the classical slender-delta result.
 *
 * Plain strip theory has none of this (doc 01 "Open questions": sideslip roll), so a flat-winged dart had no
 * dihedral effect at all and could not hold its heading. The term is applied
 *  - to wing strips only, as an extra normal force at the strip's centre of pressure, faded out by the stall;
 *  - weighted by the surface's `deltaness` (it is established for swept, delta-like planforms; the weaker
 *    tip-vortex effect of unswept low-AR plates stays unmodelled) and by Kp / (pi AR / 2), the ratio of the
 *    surface's lift slope to the slender-wing slope, i.e. the finite-AR correction the lift itself gets;
 *  - never larger than the strip's own attached normal force: a slip can at most move the load to one side.
 */
const SLIP_LOADING = 2 * Math.PI;

/** Slender-wing weight of the sideslip loading for one surface, 0 to 1. */
export function slipLoadingWeight(surface: Pick<LiftingSurface, 'deltaness' | 'kp' | 'aspectRatio'>): number {
  const slenderSlope = 0.5 * Math.PI * surface.aspectRatio;
  if (!(slenderSlope > 0)) return 0;
  return Math.max(0, Math.min(1, surface.deltaness)) * Math.min(1, surface.kp / slenderSlope);
}

/** Largest incidence shift a bend may produce, radians: keeps the shifted angle inside the model's range. */
const MAX_BEND_SHIFT = 1.2;

/**
 * A bent trailing edge as a plain flap (doc 01 sections 8 and 10.2), for a bend of `delta` radians toward
 * +normal over the chord fraction E.
 *
 *  shift   incidence added in attached flow: eta_f tau delta.
 *  moment  coefficient (per q S c) of the couple about the span axis that puts the bend's share of the normal
 *          force, Kp shift, where it really acts instead of at the strip's centre of pressure.
 *
 * Thin-airfoil limit (wide wings): tau = tau(E) and the bend's load acts |Cm_delta| / (2 pi tau) chords behind
 * the centre of pressure, which is exactly the document's couple -Cm_delta delta eta_f Kp / (2 pi).
 * Slender limit (AR -> 0, doc 01 section 8 "low-AR limit"): tau = 1 and the load sits at the hinge line,
 * (1 - E) - k0 chords behind the centre of pressure. The surface's `flapSlenderness` blends the two. Without
 * the slender limit a bend at the rear of a long keel would act a quarter chord behind the keel's NOSE and
 * turn the plane the wrong way.
 */
export function bendTerms(
  chordFrac: number,
  delta: number,
  surface: Pick<LiftingSurface, 'kp' | 'k0' | 'flapEfficiency' | 'flapSlenderness'>,
): { shift: number; moment: number } {
  const tau2d = flapTau(chordFrac);
  if (!(tau2d > 0)) return { shift: 0, moment: 0 };
  const slender = Math.max(0, Math.min(1, surface.flapSlenderness));
  const tau = tau2d + (1 - tau2d) * slender;
  const offset2d = -flapCmDelta(chordFrac) / (2 * Math.PI * tau2d);
  const offsetSlender = Math.max(0, 1 - chordFrac - surface.k0);
  const offset = offset2d + (offsetSlender - offset2d) * slender;
  const shift = surface.flapEfficiency * tau * delta;
  return { shift, moment: surface.kp * shift * offset };
}

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
      const bend = bendTerms(e.bendFrac, e.bendRad, s);
      const limited = Math.max(-MAX_BEND_SHIFT, Math.min(MAX_BEND_SHIFT, bend.shift));
      data[o + BEND_SIN] = Math.sin(limited);
      data[o + BEND_COS_LESS_ONE] = Math.cos(limited) - 1;
      data[o + BEND_MOMENT] = bend.moment * e.area * e.chord * e.exposure;
    }
    const rx = data[o + RX];
    const ry = data[o + RX + 1];
    const rz = data[o + RX + 2];
    data[o + RXN] = ry * nz - rz * ny;
    data[o + RXN + 1] = rz * nx - rx * nz;
    data[o + RXN + 2] = rx * ny - ry * nx;
    data[o + AX] = ey * nz - ez * ny;
    data[o + AX + 1] = ez * nx - ex * nz;
    data[o + AX + 2] = ex * ny - ey * nx;
    if (e.role === 'wing' || e.role === 'center') {
      // Signed so that the factor is positive on the side the span axis (chord x normal) points to.
      const spanZ = data[o + AX + 2];
      const side = rz * spanZ > 0 ? 1 : rz * spanZ < 0 ? -1 : 0;
      data[o + SLIP] = SLIP_LOADING * slipLoadingWeight(s) * side;
    }
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

// The integrator asks for the same airframe forty thousand times per flight: remember the last one.
let lastAirframe: Airframe | null = null;
let lastCompiled: Compiled | null = null;

/** Compiled form of an airframe, built on first use. Airframes are immutable once built. */
function compiled(airframe: Airframe): Compiled {
  if (airframe === lastAirframe && lastCompiled !== null) return lastCompiled;
  let c = cache.get(airframe);
  if (!c) {
    c = compile(airframe);
    cache.set(airframe, c);
  }
  lastAirframe = airframe;
  lastCompiled = c;
  return c;
}

/* ---- the element loop ---- */

/** Speeds below this give no force, m/s. Also keeps divisions finite. */
const MIN_SPEED = 1e-6;
/** Keeps 0 / 0 at zero: far below any squared speed (m²/s²) or force coefficient that matters. */
const EPS = 1e-12;

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
  /** Moment of the element about the CG, body frame, N m (bend and pitch-rate couples included). */
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

/**
 * Sum of the element loads (doc 01 section 10.2) into `out`; with `detail`, the per-element breakdown too.
 * One function holds the whole loop on purpose: numbers handed to a separate per-element function would be
 * boxed on the heap at every call.
 *
 * Per element:
 *  - velocity through the air at the 3/4-chord point measured from the upstream edge;
 *  - signed incidence against the plate plane from the normal and the full in-plane speed;
 *  - bend: incidence shift and bend moment of a plain flap (`bendTerms`), blended out by the stall;
 *  - CN: potential + vortex term, smoothstep blend into the bluff-plate curve; the centre of pressure is
 *    blended with the loads (force-weighted), which equals the document's x_cp outside the stall band;
 *  - friction on the in-plane velocity; normal force at the centre of pressure, friction at mid-chord;
 *  - pitch-rate couple (not in the document's pseudocode, see below).
 *
 * The pseudocode switches on the sign of the chordwise velocity vx in two places: which 3/4-chord point is
 * used, and whether the bend terms act. Here both fade linearly while |vx| is below UPSTREAM_FADE times the
 * flight speed, so the loads stay continuous when a strip slides sideways or tumbles. Outside that narrow
 * band the result is exactly the pseudocode.
 *
 * Pitch-rate couple. The pseudocode takes the incidence at the 3/4-chord point and applies the whole normal
 * force at the centre of pressure near the quarter chord. That reproduces the thin-airfoil LIFT due to pitch
 * rate but not its MOMENT: a strip turning about a point between its quarter and 3/4 chord would be driven on
 * instead of damped (a long keel in yaw, the root strips of a dart in pitch). In quasi-steady thin-airfoil
 * theory (Theodorsen with C(k) = 1) the lift added by rotation about mid-chord has no moment about mid-chord.
 * The loop therefore applies the rotation-induced share of the attached normal force at mid-chord.
 */
function accumulate(
  airframe: Airframe, vRelBody: Vec3, omegaBody: Vec3, air: Air, out: AeroLoads, detail: ElementLoad[] | null,
): void {
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
  // 1 / (chordwise speed at which the upstream-edge switch is complete).
  const ramp = 1 / (UPSTREAM_FADE * Math.sqrt(vx * vx + vy * vy + vz * vz) + MIN_SPEED);
  let sumFx = 0;
  let sumFy = 0;
  let sumFz = 0;
  let sumMx = 0;
  let sumMy = 0;
  let sumMz = 0;

  const end = c.count * STRIDE;
  for (let o = 0; o < end; o += STRIDE) {
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
    const kx = wy * ez - wz * ey;
    const ky = wz * ex - wx * ez;
    const kz = wx * ey - wy * ex;
    ux += back * kx;
    uy += back * ky;
    uz += back * kz;
    // Normal velocity the strip's own rotation adds between mid-chord and the evaluation point.
    const unRotation = back * (kx * nx + ky * ny + kz * nz);
    const u2 = ux * ux + uy * uy + uz * uz;
    if (u2 < MIN_SPEED * MIN_SPEED) {
      if (detail !== null) detail.push(idleElement(detail.length, airframe));
      continue;
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

    // Normal-force coefficient and its first moment about the upstream edge, CN x_cp (in chords).
    // Attached: potential part at xp = k0 + (0.5 - k0) sin a, vortex part at its own fraction.
    // Separated: bluff plate at xp. The two states are blended as loads, force and moment alike.
    const kp = d[o + KP];
    const cnPotential = kp * sp * cosA;
    const k0 = d[o + K0];
    const xp = k0 + (0.5 - k0) * sp;
    const cnVortex = d[o + KV] * sp * sp;
    let cn = cnPotential + cnVortex;
    let cnx = cnPotential * xp + cnVortex * d[o + VORTEX_CP];
    if (sep > 0) {
      const plate = (d[o + CD90] * sp) / (PLATE_SHAPE_A + PLATE_SHAPE_B * sp);
      cn = (1 - sep) * cn + sep * plate;
      cnx = (1 - sep) * cnx + sep * plate * xp;
    }

    const area = d[o + AREA];
    const exposure = d[o + EXPOSURE];
    const q = 0.5 * rho * u2;
    const pressure = -sign * q * area * exposure;
    // The normal force acts x_cp chords behind the upstream edge: (0.5 - x_cp) c cx ahead of mid-chord.
    const lever = chord * cx;
    let fn = pressure * cn;
    let fnLever = pressure * (0.5 * cn - cnx) * lever;

    // Sideslip loading of a slender wing (see SLIP_LOADING): the windward half is loaded up, the leeward
    // half unloaded, by at most the strip's own attached normal force.
    const slip = d[o + SLIP];
    if (slip !== 0 && sep < 1) {
      const us = (ux * d[o + AX] + uy * d[o + AX + 1] + uz * d[o + AX + 2]) * invSpeed;
      const attached = cnPotential + cnVortex;
      let extra = -slip * sinA * us;
      if (extra > attached) extra = attached;
      else if (extra < -attached) extra = -attached;
      const fSlip = q * area * exposure * extra * (1 - sep);
      fn += fSlip;
      fnLever += fSlip * (0.5 - xp) * lever;
    }

    // Skin friction on the in-plane velocity, at mid-chord.
    const re = rhoOverMu * speed * chord;
    const cf = BLASIUS_BOTH_FACES / Math.sqrt(re > RE_FLOOR ? re : RE_FLOOR) + EDGE_DRAG;
    const kt = -0.5 * rho * area * cf * speed * d[o + FRICTION];
    const ftx = kt * (ux - un * nx);
    const fty = kt * (uy - un * ny);
    const ftz = kt * (uz - un * nz);

    // Couples about the span axis (chord x normal):
    //  - the lever of the normal force along the chord;
    //  - the bend moment;
    //  - the pitch-rate couple: the attached-flow part of the normal force that the strip's own rotation adds,
    //    0.5 rho V S Kp cos(2a) un_rotation, moved from the centre of pressure to mid-chord.
    const slope = cosA * cosA - sp * sp;
    const rate = slope > 0 ? 0.5 * rho * speed * area * kp * slope * exposure * unRotation * (0.5 - xp) * lever : 0;
    const couple = fnLever + (d[o + BEND_MOMENT] * q * lead + rate) * (1 - sep);

    const fx = fn * nx + ftx;
    const fy = fn * ny + fty;
    const fz = fn * nz + ftz;
    const mx = fn * d[o + RXN] + ry * ftz - rz * fty + couple * d[o + AX];
    const my = fn * d[o + RXN + 1] + rz * ftx - rx * ftz + couple * d[o + AX + 1];
    const mz = fn * d[o + RXN + 2] + rx * fty - ry * ftx + couple * d[o + AX + 2];
    sumFx += fx;
    sumFy += fy;
    sumFz += fz;
    sumMx += mx;
    sumMy += my;
    sumMz += mz;

    if (detail !== null) {
      const arm = cn > EPS ? (0.5 - cnx / cn) * lever : 0;
      const cg = airframe.cg;
      detail.push({
        index: detail.length,
        force: [fx, fy, fz],
        normalForce: [fn * nx, fn * ny, fn * nz],
        friction: [ftx, fty, ftz],
        moment: [mx, my, mz],
        cp: [rx + arm * ex + cg[0], ry + arm * ey + cg[1], rz + arm * ez + cg[2]],
        incidence: Math.asin(Math.max(-1, Math.min(1, sinA))),
        separation: sep,
        cn,
        dynamicPressure: q,
        reynolds: re,
      });
    }
  }

  out.force[0] = sumFx;
  out.force[1] = sumFy;
  out.force[2] = sumFz;
  out.moment[0] = sumMx;
  out.moment[1] = sumMy;
  out.moment[2] = sumMz;
}

/** An element that feels no air at all (no relative speed). */
function idleElement(index: number, airframe: Airframe): ElementLoad {
  const e = airframe.elements[index];
  const mid: Vec3 = [
    e.le[0] + 0.5 * e.chord * e.chordDir[0],
    e.le[1] + 0.5 * e.chord * e.chordDir[1],
    e.le[2] + 0.5 * e.chord * e.chordDir[2],
  ];
  return {
    index,
    force: [0, 0, 0],
    normalForce: [0, 0, 0],
    friction: [0, 0, 0],
    moment: [0, 0, 0],
    cp: mid,
    incidence: 0,
    separation: 0,
    cn: 0,
    dynamicPressure: 0,
    reynolds: 0,
  };
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
  accumulate(airframe, vRelBody, omegaBody, air, out, null);
}

export interface AeroLoadsDetail extends AeroLoads {
  elements: ElementLoad[];
}

/** Same physics as `aeroLoads` (the same loop), with the per-element breakdown. Allocates; not for the integrator. */
export function aeroLoadsDetailed(airframe: Airframe, vRelBody: Vec3, omegaBody: Vec3, air: Air): AeroLoadsDetail {
  const out: AeroLoadsDetail = { force: [0, 0, 0], moment: [0, 0, 0], elements: [] };
  accumulate(airframe, vRelBody, omegaBody, air, out, out.elements);
  return out;
}
