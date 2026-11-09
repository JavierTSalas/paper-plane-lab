/**
 * Virtual wind tunnel: static evaluations of the same `aeroLoads` the flight simulation uses
 * (ARCHITECTURE.md section 6.3, docs/research/02-flight-dynamics-validation.md section 8).
 *
 * Wind axes. The body moves through still air with velocity
 *   v = V (cos a cos b, -sin a cos b, sin b)        (body frame: +x nose, +y up, +z right)
 * so a > 0 puts the wind on the underside and b > 0 brings it from the right.
 *   drag  = -F . v_hat                               along the relative wind
 *   lift  =  F . (sin a, cos a, 0)                   perpendicular to the wind, in the plane of symmetry
 *   side  =  F . (v_hat x lift axis)                 body +z at b = 0
 */
import { aeroLoads, createAeroLoads } from '../aero';
import { STANDARD_GRAVITY } from '../airframe';
import { DEG } from '../math';
import type { Air, Airframe, PolarPoint, TrimAnalysis, TunnelReading } from '../types';

export interface TunnelSetting {
  speed: number;
  alphaDeg: number;
  betaDeg: number;
}

export interface PolarOptions {
  speed: number;
  fromDeg?: number;
  toDeg?: number;
  stepDeg?: number;
}

/** Whole-plane coefficients at one tunnel setting. */
interface Coefficients {
  cl: number;
  cd: number;
  /** Pitching moment about the CG / (q S MAC). Positive = nose up. */
  cm: number;
  /** Roll moment about body +x / (q S b). */
  croll: number;
  /** Yaw moment about body +y / (q S b). */
  cyaw: number;
  lift: number;
  drag: number;
  side: number;
  /** Body-frame force component along +y, N. */
  normal: number;
}

const loads = createAeroLoads();
const velocity: [number, number, number] = [0, 0, 0];
const NO_ROTATION = [0, 0, 0] as const;

function measure(airframe: Airframe, air: Air, speed: number, alpha: number, beta: number, out: Coefficients): void {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  // Unit vector of the body's motion through the air.
  const hx = ca * cb;
  const hy = -sa * cb;
  const hz = sb;
  velocity[0] = speed * hx;
  velocity[1] = speed * hy;
  velocity[2] = speed * hz;
  aeroLoads(airframe, velocity, NO_ROTATION, air, loads);
  const [fx, fy, fz] = loads.force;
  // Side axis = v_hat x lift axis, with the lift axis (sa, ca, 0).
  const sx = -hz * ca;
  const sy = hz * sa;
  const sz = hx * ca - hy * sa;
  out.drag = -(fx * hx + fy * hy + fz * hz);
  out.lift = fx * sa + fy * ca;
  out.side = fx * sx + fy * sy + fz * sz;
  out.normal = fy;
  const qs = 0.5 * air.rho * speed * speed * airframe.ref.area;
  if (qs > 0) {
    out.cl = out.lift / qs;
    out.cd = out.drag / qs;
    out.cm = airframe.ref.mac > 0 ? loads.moment[2] / (qs * airframe.ref.mac) : 0;
    out.croll = airframe.ref.span > 0 ? loads.moment[0] / (qs * airframe.ref.span) : 0;
    out.cyaw = airframe.ref.span > 0 ? loads.moment[1] / (qs * airframe.ref.span) : 0;
  } else {
    out.cl = 0;
    out.cd = 0;
    out.cm = 0;
    out.croll = 0;
    out.cyaw = 0;
  }
}

const newCoefficients = (): Coefficients => ({
  cl: 0, cd: 0, cm: 0, croll: 0, cyaw: 0, lift: 0, drag: 0, side: 0, normal: 0,
});

/** Normal-force coefficient below which the centre of pressure is not defined. */
const MIN_CP_NORMAL = 1e-4;

/** One static reading at a fixed airspeed, angle of attack and sideslip. */
export function tunnelReading(airframe: Airframe, setting: TunnelSetting, air: Air): TunnelReading {
  const c = newCoefficients();
  measure(airframe, air, setting.speed, setting.alphaDeg * DEG, setting.betaDeg * DEG, c);
  const qs = 0.5 * air.rho * setting.speed * setting.speed * airframe.ref.area;
  const pitch = loads.moment[2];
  // The point on the body x axis through the CG height where the normal force alone gives the pitching moment.
  const cpX = qs > 0 && Math.abs(c.normal) > MIN_CP_NORMAL * qs ? airframe.cg[0] + pitch / c.normal : null;
  return {
    speed: setting.speed,
    alphaDeg: setting.alphaDeg,
    betaDeg: setting.betaDeg,
    lift: c.lift,
    drag: c.drag,
    side: c.side,
    moment: [loads.moment[0], loads.moment[1], loads.moment[2]],
    cl: c.cl,
    cd: c.cd,
    cm: c.cm,
    reynolds: (air.rho * setting.speed * airframe.ref.mac) / air.mu,
    cpX,
  };
}

/** CL, CD, Cm and L/D against angle of attack at zero sideslip and fixed airspeed. */
export function computePolar(airframe: Airframe, air: Air, options: PolarOptions): PolarPoint[] {
  const { speed, fromDeg = -10, toDeg = 60, stepDeg = 1 } = options;
  const points: PolarPoint[] = [];
  if (!(stepDeg > 0)) return points;
  const c = newCoefficients();
  const count = Math.floor((toDeg - fromDeg) / stepDeg + 1e-9);
  for (let i = 0; i <= count; i++) {
    const alphaDeg = fromDeg + i * stepDeg;
    measure(airframe, air, speed, alphaDeg * DEG, 0, c);
    points.push({ alphaDeg, cl: c.cl, cd: c.cd, cm: c.cm, ld: c.cd > 0 ? c.cl / c.cd : 0 });
  }
  return points;
}

/* ---- trim and stability ---- */

/** Sweep used for the stall, best L/D and the trim bracket: 0 to 60 degrees in quarter degrees (doc 02 section 8). */
const SWEEP_TO_DEG = 60;
const SWEEP_STEP_DEG = 0.25;
/** A stable Cm = 0 crossing below this lift coefficient is a dive, not a glide. */
const MIN_TRIM_CL = 0.02;
/** Half-interval for the neutral-point finite difference (doc 02 section 8). */
const NP_STEP_DEG = 0.5;
/** Half-interval for the sideslip derivatives. */
const BETA_STEP_DEG = 1;
/** First guess of the glide speed, m/s (doc 01 section 1: typical glide 3-5 m/s). */
const FIRST_SPEED = 4;
const MIN_SPEED = 0.3;
const MAX_SPEED = 60;
const SPEED_ITERATIONS = 12;
const BISECTIONS = 48;

/** Vertex of the parabola through three equally spaced samples, as an offset from the middle one in steps. */
function vertexOffset(a: number, b: number, c: number): number {
  const den = a - 2 * b + c;
  return den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
}

/**
 * Trim, glide and static stability.
 *
 * Trim is the stable pitch equilibrium (Cm = 0 with Cm falling) between zero incidence and the stall with
 * positive lift. The glide speed follows from L = W cos(gamma), gamma = atan(CD / CL), iterated because the
 * Reynolds number changes the friction. The neutral point is x_cg - MAC * (-dCm/dCL) at trim. When no trim
 * exists the stability numbers are evaluated at the best-glide angle of attack instead.
 *
 * Signs in this body frame (+x nose, +y up, +z right; beta > 0 = wind from the right):
 *  - clBeta < 0: the windward wing rises (positive roll about +x drops the right wing)  -> rollStable;
 *  - cnBeta < 0: the nose turns right, into the wind (positive yaw about +y is nose LEFT) -> yawStable.
 */
export function analyzeTrim(airframe: Airframe, air: Air): TrimAnalysis {
  const { area, mac, span } = airframe.ref;
  const weight = airframe.mass * STANDARD_GRAVITY;
  if (!(area > 0) || !(mac > 0) || !(span > 0) || !(weight > 0) || airframe.elements.length === 0) {
    return {
      trimmable: false, alphaDeg: null, cl: null, speed: null, glideRatio: null, sinkRate: null,
      neutralPointX: airframe.cg[0], staticMarginPct: 0, pitchStable: false,
      clBeta: 0, cnBeta: 0, rollStable: false, yawStable: false, cnBetaDynamic: 0,
      bestLd: 0, bestLdAlphaDeg: 0, stallAlphaDeg: 0,
    };
  }

  const c = newCoefficients();
  const count = Math.round(SWEEP_TO_DEG / SWEEP_STEP_DEG) + 1;
  const cl = new Float64Array(count);
  const ld = new Float64Array(count);
  const cm = new Float64Array(count);

  let speed = FIRST_SPEED;
  let trimAlpha: number | null = null;
  let stallAlphaDeg = 0;
  let bestLd = 0;
  let bestLdAlphaDeg = 0;
  let refAlpha = 0;

  for (let iter = 0; iter < SPEED_ITERATIONS; iter++) {
    for (let i = 0; i < count; i++) {
      measure(airframe, air, speed, i * SWEEP_STEP_DEG * DEG, 0, c);
      cl[i] = c.cl;
      cm[i] = c.cm;
      ld[i] = c.cd > 0 ? c.cl / c.cd : 0;
    }

    // Stall: where the lift curve first turns over; the highest lift when it never does.
    let stall = -1;
    for (let i = 1; i + 1 < count; i++) {
      if (cl[i] > 0 && cl[i] >= cl[i - 1] && cl[i] > cl[i + 1]) {
        stall = i;
        break;
      }
    }
    if (stall < 0) {
      stall = 0;
      for (let i = 1; i < count; i++) if (cl[i] > cl[stall]) stall = i;
      stallAlphaDeg = stall * SWEEP_STEP_DEG;
    } else {
      stallAlphaDeg = (stall + vertexOffset(cl[stall - 1], cl[stall], cl[stall + 1])) * SWEEP_STEP_DEG;
    }

    let best = 0;
    for (let i = 1; i < count; i++) if (ld[i] > ld[best]) best = i;
    bestLd = ld[best];
    bestLdAlphaDeg = best * SWEEP_STEP_DEG;
    if (best > 0 && best + 1 < count) {
      const off = vertexOffset(ld[best - 1], ld[best], ld[best + 1]);
      bestLdAlphaDeg = (best + off) * SWEEP_STEP_DEG;
      // Parabola value at its vertex.
      bestLd = ld[best] - 0.25 * (ld[best - 1] - ld[best + 1]) * off;
    }

    // Stable trim below the stall: Cm crosses zero downward with positive lift.
    trimAlpha = null;
    for (let i = 0; i < stall && trimAlpha === null; i++) {
      if (!(cm[i] > 0 && cm[i + 1] <= 0)) continue;
      let lo = i * SWEEP_STEP_DEG * DEG;
      let hi = (i + 1) * SWEEP_STEP_DEG * DEG;
      for (let k = 0; k < BISECTIONS; k++) {
        const mid = 0.5 * (lo + hi);
        measure(airframe, air, speed, mid, 0, c);
        if (c.cm > 0) lo = mid;
        else hi = mid;
      }
      const root = 0.5 * (lo + hi);
      measure(airframe, air, speed, root, 0, c);
      if (c.cl > MIN_TRIM_CL) trimAlpha = root;
    }

    refAlpha = trimAlpha ?? bestLdAlphaDeg * DEG;
    measure(airframe, air, speed, refAlpha, 0, c);
    // L = W cos(gamma) and D = W sin(gamma): V² = 2 W / (rho S sqrt(CL² + CD²)).
    const resultant = Math.hypot(c.cl, c.cd);
    const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.sqrt((2 * weight) / (air.rho * area * resultant))));
    const settled = Math.abs(next - speed) <= 1e-7 * speed;
    speed = next;
    if (settled) break;
  }

  measure(airframe, air, speed, refAlpha, 0, c);
  const trimCl = c.cl;
  const trimCd = c.cd;

  // Neutral point: Kn = -dCm/dCL about the reference angle of attack.
  const da = NP_STEP_DEG * DEG;
  measure(airframe, air, speed, refAlpha + da, 0, c);
  const clUp = c.cl;
  const cmUp = c.cm;
  measure(airframe, air, speed, refAlpha - da, 0, c);
  const dCl = clUp - c.cl;
  const margin = Math.abs(dCl) > 1e-9 ? -(cmUp - c.cm) / dCl : 0;

  // Sideslip derivatives by central differences.
  const db = BETA_STEP_DEG * DEG;
  measure(airframe, air, speed, refAlpha, db, c);
  const rollUp = c.croll;
  const yawUp = c.cyaw;
  measure(airframe, air, speed, refAlpha, -db, c);
  const clBeta = (rollUp - c.croll) / (2 * db);
  const cnBeta = (yawUp - c.cyaw) / (2 * db);

  // Departure criterion of slender aircraft, written for this frame (yaw about +y, stable cnBeta is negative).
  const rollInertia = airframe.inertia[0];
  const yawInertia = airframe.inertia[4];
  const inertiaRatio = rollInertia > 0 ? yawInertia / rollInertia : 0;
  const cnBetaDynamic = -cnBeta * Math.cos(refAlpha) - inertiaRatio * clBeta * Math.sin(refAlpha);

  const trimmable = trimAlpha !== null;
  const gamma = Math.atan2(trimCd, trimCl);
  return {
    trimmable,
    alphaDeg: trimmable ? refAlpha / DEG : null,
    cl: trimmable ? trimCl : null,
    speed: trimmable ? speed : null,
    glideRatio: trimmable ? trimCl / trimCd : null,
    sinkRate: trimmable ? speed * Math.sin(gamma) : null,
    neutralPointX: airframe.cg[0] - margin * mac,
    staticMarginPct: 100 * margin,
    pitchStable: margin > 0,
    clBeta,
    cnBeta,
    rollStable: clBeta < 0,
    yawStable: cnBeta < 0,
    cnBetaDynamic,
    bestLd,
    bestLdAlphaDeg,
    stallAlphaDeg,
  };
}
