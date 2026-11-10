/**
 * The flight: 6-DOF rigid body, classical RK4 at a fixed step, first-touch termination.
 * Model: docs/research/02-flight-dynamics-validation.md sections 1, 3, 7, 8 and 9.
 *
 * State (13 numbers): CG position in the world frame, CG velocity in the BODY frame, attitude quaternion
 * [x, y, z, w] (body -> world), angular velocity in the body frame.
 *
 *   p'     = R v
 *   M v'   = F_aero + m R^T g - m (omega x v) + A (R^T w' - omega x R^T w)        M = m 1 + A
 *   q'     = 0.5 q (x) [omega, 0]
 *   J om'  = M_aero - omega x (I omega)                                           J = I + I_a
 *
 * A and I_a are the apparent mass and inertia of the air (doc 02 section 3): on the acceleration side only,
 * no Munk moment, rigid-body values in the gyroscopic terms. The wind term makes the apparent mass react to
 * the acceleration RELATIVE TO THE AIR, so a gust pushes the plane. Doc 02 writes that term as
 * "v' - R^T w'"; taken literally in a rotating body frame it would let a steady, uniform wind exert a force
 * on a plane that turns in it. The form above is the derivative of the body-frame relative velocity
 * v - R^T w, which leaves a flight in uniform wind identical to the same flight in still air seen from the
 * moving air (tested).
 *
 * Wind. One wind vector for the whole plane (doc 03 section 3.3). The field is sampled once per step at the
 * predicted end position of the step and varies linearly in time inside the step, so the four RK stages see
 * a continuous wind and a constant w'.
 */
import { aeroLoads, createAeroLoads } from '../aero';
import { STANDARD_GRAVITY } from '../airframe';
import { terrainHeight, terrainMaxSlope, terrainTop } from '../env';
import { DEG, mat3Inverse, quatFromAxisAngle, quatMul, quatRotate, quatRotateInv } from '../math';
import { airFrom, createWindField, resolveWind } from '../wind';
import type {
  Airframe, Conditions, Environment, FlightEvent, FlightEventKind, FlightMetrics, FlightResult, FlightSample,
  Launch, Mat3, Quat, Vec3, WindField,
} from '../types';
import { diagnose } from './diagnose';
import { findSteadyGlide } from './metrics';

/** Integration step, seconds (doc 02 section 9: classical RK4 at 1.0 ms). */
export const DEFAULT_DT = 1e-3;
/** Output sample rate, Hz (ARCHITECTURE.md section 6.5). */
export const SAMPLE_HZ = 120;
/** A flight still airborne after this long is stopped, seconds (ARCHITECTURE.md section 6.5). */
export const MAX_FLIGHT_TIME = 60;
/**
 * Stiffness guard (doc 02 section 1.4): the step is sub-divided until lambda_est * dt <= 1, where
 * lambda_est = sum_i 0.5 rho |v| A_i CN' r_i² / I_axis with CN' about 2 per radian.
 */
const GUARD_CN_SLOPE = 2;
const GUARD_LIMIT = 1;
/** Most sub-steps one step may be cut into (design choice: bounds the cost of a violent tumble). */
const MAX_SUBSTEPS = 16;
/** The flow reattaches this far below the stall angle, radians (doc 01 section 10.2: alpha_s - 3 deg). */
const RECOVER_BELOW_STALL = 3 * DEG;
/** Below this airspeed the angle of attack means nothing and no coefficients are reported, m/s (design choice). */
const MIN_AIRSPEED = 0.2;
/** The apex is reported when the plane climbed at least this far above the release point, metres (design choice). */
const MIN_APEX_RISE = 0.01;
/** A state whose position (m) plus rotation rate (rad/s) passes this has diverged numerically; real flights stay below 1e4. */
const DIVERGED = 1e9;
const TWO_PI = 2 * Math.PI;
/** Time tolerance when comparing step and sample times, seconds: far below any step. */
const TIME_EPS = 1e-9;

export interface SimOptions {
  /** Integration step, seconds. Default 1 ms. */
  dt?: number;
  /** false switches the air off entirely (no forces, no apparent mass): a ballistic rigid body. Default true. */
  aero?: boolean;
  /** Angular velocity at release, body frame, rad/s. Default zero. */
  omega0?: Vec3;
  /** Stop after this many seconds. Default 60. */
  maxTime?: number;
  /** Output sample rate, Hz. Default 120. */
  sampleHz?: number;
  /** A ready-made wind field to fly in, instead of the environment's own (tests, tools). */
  wind?: WindField;
}

type Triple = [number, number, number];

// State layout.
const PX = 0;
const VX = 3;
const QX = 6;
const OX = 10;
const N = 13;

// Contact surfaces, in order of precedence when two are reached in the same instant.
const SURFACE_GROUND = 0;
const SURFACE_CEILING = 5;
const SURFACES = 6;

/** Attitude at release: nose along the throw (yaw, then pitch), then roll about the nose, then angle of attack. */
export function launchAttitude(launch: Launch): Quat {
  const yaw = quatFromAxisAngle([0, 1, 0], -launch.yawDeg * DEG);
  const pitch = quatFromAxisAngle([0, 0, 1], launch.pitchDeg * DEG);
  const roll = quatFromAxisAngle([1, 0, 0], launch.rollDeg * DEG);
  const aoa = quatFromAxisAngle([0, 0, 1], launch.aoaDeg * DEG);
  return quatMul(quatMul(quatMul(yaw, pitch), roll), aoa);
}

/** World-frame velocity of the throw. */
export function launchVelocity(launch: Launch): Vec3 {
  const pitch = launch.pitchDeg * DEG;
  const yaw = launch.yawDeg * DEG;
  const level = launch.speed * Math.cos(pitch);
  return [level * Math.cos(yaw), launch.speed * Math.sin(pitch), level * Math.sin(yaw)];
}

const addMat = (a: Mat3, b: Mat3): Mat3 => a.map((v, i) => v + b[i]) as unknown as Mat3;

/**
 * Inverse of a mass or inertia matrix. The matrix is scaled to order one first (the inertia of a paper plane
 * is around 1e-6 kg m², and `mat3Inverse` judges singularity by an absolute threshold). A matrix that is
 * singular even so, which no folded sheet produces, gives the zero matrix: that degree of freedom does not respond.
 */
function invertScaled(m: Mat3): Mat3 {
  let scale = 0;
  for (const v of m) scale = Math.max(scale, Math.abs(v));
  if (!(scale > 0) || !Number.isFinite(scale)) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  try {
    return mat3Inverse(m.map((v) => v / scale) as unknown as Mat3).map((v) => v / scale) as unknown as Mat3;
  } catch {
    return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
}

/**
 * Simulate one throw from release to the first touch of the ground, a wall or the ceiling, or to the time
 * limit. Deterministic: the same arguments give a bit-identical result.
 */
export function simulateFlight(
  airframe: Airframe, launch: Launch, env: Environment, conditions: Conditions, seed: number, opts: SimOptions = {},
): FlightResult {
  const dt = opts.dt !== undefined && opts.dt > 0 ? opts.dt : DEFAULT_DT;
  const aero = opts.aero !== false;
  const maxTime = opts.maxTime !== undefined && opts.maxTime > 0 ? opts.maxTime : MAX_FLIGHT_TIME;
  const sampleHz = opts.sampleHz !== undefined && opts.sampleHz > 0 ? opts.sampleHz : SAMPLE_HZ;
  const air = airFrom(env.tempC, env.pressurePa, env.humidity);
  const field = opts.wind ?? createWindField(resolveWind(env, conditions), seed, env);
  const g = STANDARD_GRAVITY;
  const m = airframe.mass;

  /* ---- constant matrices ---- */
  const I = airframe.inertia;
  const A: Mat3 = aero ? airframe.apparentMass : [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const hasApparent = A.some((v) => v !== 0);
  const Mi = invertScaled(addMat([m, 0, 0, 0, m, 0, 0, 0, m], A));
  const J = aero ? addMat(I, airframe.apparentInertia) : I;
  const Ji = invertScaled(J);
  const [A0, A1, A2, A3, A4, A5, A6, A7, A8] = A;
  const [M0, M1, M2, M3, M4, M5, M6, M7, M8] = Mi;
  const [I0, I1, I2, I3, I4, I5, I6, I7, I8] = I;
  const [J0, J1, J2, J3, J4, J5, J6, J7, J8] = Ji;

  /* ---- stiffness guard: fastest damping rate per unit airspeed, and the reach of the airframe ---- */
  let reach = 0;
  let stiffness = 0;
  if (aero) {
    let aboutX = 0;
    let aboutY = 0;
    let aboutZ = 0;
    let heave = 0;
    for (const e of airframe.elements) {
      const rx = e.le[0] + 0.5 * e.chord * e.chordDir[0] - airframe.cg[0];
      const ry = e.le[1] + 0.5 * e.chord * e.chordDir[1] - airframe.cg[1];
      const rz = e.le[2] + 0.5 * e.chord * e.chordDir[2] - airframe.cg[2];
      const k = 0.5 * air.rho * e.area * GUARD_CN_SLOPE;
      aboutX += k * (ry * ry + rz * rz);
      aboutY += k * (rx * rx + rz * rz);
      aboutZ += k * (rx * rx + ry * ry);
      heave += k;
      reach = Math.max(reach, Math.hypot(rx, ry, rz) + 0.5 * e.chord);
    }
    stiffness = Math.max(aboutX / J[0], aboutY / J[4], aboutZ / J[8], heave / m);
    if (!(stiffness >= 0)) stiffness = 0;
  }

  /* ---- contact geometry ---- */
  const bounds = env.bounds;
  const terrain = env.terrain;
  const flat = terrain.kind === 'flat';
  const groundTop = terrainTop(terrain);
  const slope = terrainMaxSlope(terrain);
  const contactCount = airframe.contactPoints.length;
  const contact = new Float64Array(contactCount * 3);
  let hull = 0;
  airframe.contactPoints.forEach((p, i) => {
    for (let a = 0; a < 3; a++) contact[i * 3 + a] = p[a] - airframe.cg[a];
    hull = Math.max(hull, Math.hypot(p[0] - airframe.cg[0], p[1] - airframe.cg[1], p[2] - airframe.cg[2]));
  });
  const gapNow = new Float64Array(contactCount * SURFACES);
  const gapBefore = new Float64Array(contactCount * SURFACES);

  /** True when some contact point could be touching something: a cheap test on the CG alone. */
  const nearSomething = (s: Float64Array): boolean => {
    const x = s[PX];
    const y = s[PX + 1];
    const z = s[PX + 2];
    if (bounds) {
      if (x - hull < bounds.xMin || x + hull > bounds.xMax || z - hull < bounds.zMin || z + hull > bounds.zMax) return true;
      if (y + hull > bounds.ceiling) return true;
    }
    if (flat) return y < hull;
    if (y - hull > groundTop) return false;
    if (slope === Infinity) return true;
    return y - terrainHeight(terrain, x, z) < hull * (1 + slope);
  };

  /** Signed gaps of every contact point to every surface (negative = through it). Returns the smallest. */
  const gaps = (s: Float64Array, out: Float64Array): number => {
    const qx = s[QX];
    const qy = s[QX + 1];
    const qz = s[QX + 2];
    const qw = s[QX + 3];
    const n2 = 2 / (qx * qx + qy * qy + qz * qz + qw * qw);
    const r00 = 1 - n2 * (qy * qy + qz * qz);
    const r01 = n2 * (qx * qy - qw * qz);
    const r02 = n2 * (qx * qz + qw * qy);
    const r10 = n2 * (qx * qy + qw * qz);
    const r11 = 1 - n2 * (qx * qx + qz * qz);
    const r12 = n2 * (qy * qz - qw * qx);
    const r20 = n2 * (qx * qz - qw * qy);
    const r21 = n2 * (qy * qz + qw * qx);
    const r22 = 1 - n2 * (qx * qx + qy * qy);
    let least = Infinity;
    for (let i = 0; i < contactCount; i++) {
      const cx = contact[i * 3];
      const cy = contact[i * 3 + 1];
      const cz = contact[i * 3 + 2];
      const x = s[PX] + r00 * cx + r01 * cy + r02 * cz;
      const y = s[PX + 1] + r10 * cx + r11 * cy + r12 * cz;
      const z = s[PX + 2] + r20 * cx + r21 * cy + r22 * cz;
      const o = i * SURFACES;
      out[o + SURFACE_GROUND] = y - (flat ? 0 : terrainHeight(terrain, x, z));
      if (bounds) {
        out[o + 1] = x - bounds.xMin;
        out[o + 2] = bounds.xMax - x;
        out[o + 3] = z - bounds.zMin;
        out[o + 4] = bounds.zMax - z;
        out[o + SURFACE_CEILING] = bounds.ceiling - y;
      } else {
        out[o + 1] = Infinity;
        out[o + 2] = Infinity;
        out[o + 3] = Infinity;
        out[o + 4] = Infinity;
        out[o + SURFACE_CEILING] = Infinity;
      }
      for (let j = 0; j < SURFACES; j++) if (out[o + j] < least) least = out[o + j];
    }
    return least;
  };

  /** World position of contact point `i` at state `s`. Runs once per flight. */
  const contactPointAt = (s: Float64Array, i: number): Vec3 => {
    const c = quatRotate([s[QX], s[QX + 1], s[QX + 2], s[QX + 3]], [contact[i * 3], contact[i * 3 + 1], contact[i * 3 + 2]]);
    return [s[PX] + c[0], s[PX + 1] + c[1], s[PX + 2] + c[2]];
  };

  /* ---- equations of motion ---- */
  const loads = createAeroLoads();
  const rel: Triple = [0, 0, 0];
  const om: Triple = [0, 0, 0];

  /** d(state)/dt into `d`, for wind (wx, wy, wz) and wind rate (ax, ay, az), both in the world frame. */
  const deriv = (
    s: Float64Array, wx: number, wy: number, wz: number, ax: number, ay: number, az: number, d: Float64Array,
  ): void => {
    const vx = s[VX];
    const vy = s[VX + 1];
    const vz = s[VX + 2];
    const qx = s[QX];
    const qy = s[QX + 1];
    const qz = s[QX + 2];
    const qw = s[QX + 3];
    const ox = s[OX];
    const oy = s[OX + 1];
    const oz = s[OX + 2];
    // Rotation matrix of q / |q|: exact for the slightly non-unit quaternions inside a step.
    const n2 = 2 / (qx * qx + qy * qy + qz * qz + qw * qw);
    const r00 = 1 - n2 * (qy * qy + qz * qz);
    const r01 = n2 * (qx * qy - qw * qz);
    const r02 = n2 * (qx * qz + qw * qy);
    const r10 = n2 * (qx * qy + qw * qz);
    const r11 = 1 - n2 * (qx * qx + qz * qz);
    const r12 = n2 * (qy * qz - qw * qx);
    const r20 = n2 * (qx * qz - qw * qy);
    const r21 = n2 * (qy * qz + qw * qx);
    const r22 = 1 - n2 * (qx * qx + qy * qy);

    d[PX] = r00 * vx + r01 * vy + r02 * vz;
    d[PX + 1] = r10 * vx + r11 * vy + r12 * vz;
    d[PX + 2] = r20 * vx + r21 * vy + r22 * vz;

    // Wind in the body frame.
    const bx = r00 * wx + r10 * wy + r20 * wz;
    const by = r01 * wx + r11 * wy + r21 * wz;
    const bz = r02 * wx + r12 * wy + r22 * wz;

    let fx = 0;
    let fy = 0;
    let fz = 0;
    let mx = 0;
    let my = 0;
    let mz = 0;
    if (aero) {
      rel[0] = vx - bx;
      rel[1] = vy - by;
      rel[2] = vz - bz;
      om[0] = ox;
      om[1] = oy;
      om[2] = oz;
      aeroLoads(airframe, rel, om, air, loads);
      fx = loads.force[0];
      fy = loads.force[1];
      fz = loads.force[2];
      mx = loads.moment[0];
      my = loads.moment[1];
      mz = loads.moment[2];
    }

    // Force side: aerodynamics + gravity (R^T g = -g times the second row of R) - m omega x v.
    let hx = fx - m * (g * r10 + (oy * vz - oz * vy));
    let hy = fy - m * (g * r11 + (oz * vx - ox * vz));
    let hz = fz - m * (g * r12 + (ox * vy - oy * vx));
    if (hasApparent) {
      // A (R^T w' - omega x R^T w): the apparent mass follows the air.
      const ex = r00 * ax + r10 * ay + r20 * az - (oy * bz - oz * by);
      const ey = r01 * ax + r11 * ay + r21 * az - (oz * bx - ox * bz);
      const ez = r02 * ax + r12 * ay + r22 * az - (ox * by - oy * bx);
      hx += A0 * ex + A1 * ey + A2 * ez;
      hy += A3 * ex + A4 * ey + A5 * ez;
      hz += A6 * ex + A7 * ey + A8 * ez;
    }
    d[VX] = M0 * hx + M1 * hy + M2 * hz;
    d[VX + 1] = M3 * hx + M4 * hy + M5 * hz;
    d[VX + 2] = M6 * hx + M7 * hy + M8 * hz;

    d[QX] = 0.5 * (qw * ox + qy * oz - qz * oy);
    d[QX + 1] = 0.5 * (qw * oy + qz * ox - qx * oz);
    d[QX + 2] = 0.5 * (qw * oz + qx * oy - qy * ox);
    d[QX + 3] = -0.5 * (qx * ox + qy * oy + qz * oz);

    // Moment side: M - omega x (I omega), rigid-body inertia in the gyroscopic term.
    const lx = I0 * ox + I1 * oy + I2 * oz;
    const ly = I3 * ox + I4 * oy + I5 * oz;
    const lz = I6 * ox + I7 * oy + I8 * oz;
    const tx = mx - (oy * lz - oz * ly);
    const ty = my - (oz * lx - ox * lz);
    const tz = mz - (ox * ly - oy * lx);
    d[OX] = J0 * tx + J1 * ty + J2 * tz;
    d[OX + 1] = J3 * tx + J4 * ty + J5 * tz;
    d[OX + 2] = J6 * tx + J7 * ty + J8 * tz;
  };

  const k1 = new Float64Array(N);
  const k2 = new Float64Array(N);
  const k3 = new Float64Array(N);
  const k4 = new Float64Array(N);
  const stage = new Float64Array(N);

  /** One classical RK4 step of length h, in place. Wind = (wx, wy, wz) + (ax, ay, az) * time inside the step. */
  const rk4 = (s: Float64Array, h: number, wx: number, wy: number, wz: number, ax: number, ay: number, az: number): void => {
    const half = 0.5 * h;
    deriv(s, wx, wy, wz, ax, ay, az, k1);
    for (let i = 0; i < N; i++) stage[i] = s[i] + half * k1[i];
    const mxw = wx + half * ax;
    const myw = wy + half * ay;
    const mzw = wz + half * az;
    deriv(stage, mxw, myw, mzw, ax, ay, az, k2);
    for (let i = 0; i < N; i++) stage[i] = s[i] + half * k2[i];
    deriv(stage, mxw, myw, mzw, ax, ay, az, k3);
    for (let i = 0; i < N; i++) stage[i] = s[i] + h * k3[i];
    deriv(stage, wx + h * ax, wy + h * ay, wz + h * az, ax, ay, az, k4);
    const sixth = h / 6;
    for (let i = 0; i < N; i++) s[i] += sixth * (k1[i] + 2 * (k2[i] + k3[i]) + k4[i]);
    const qn = 1 / Math.sqrt(s[QX] * s[QX] + s[QX + 1] * s[QX + 1] + s[QX + 2] * s[QX + 2] + s[QX + 3] * s[QX + 3]);
    s[QX] *= qn;
    s[QX + 1] *= qn;
    s[QX + 2] *= qn;
    s[QX + 3] *= qn;
  };

  /* ---- observation of a state: world velocity and the flow the plane sees (no trigonometry: runs every step) ---- */
  let velX = 0;
  let velY = 0;
  let velZ = 0;
  let airspeed = 0;
  let relX = 0;
  let relY = 0;
  let relZ = 0;
  const observe = (s: Float64Array, wx: number, wy: number, wz: number): void => {
    const vx = s[VX];
    const vy = s[VX + 1];
    const vz = s[VX + 2];
    const qx = s[QX];
    const qy = s[QX + 1];
    const qz = s[QX + 2];
    const qw = s[QX + 3];
    const n2 = 2 / (qx * qx + qy * qy + qz * qz + qw * qw);
    const r00 = 1 - n2 * (qy * qy + qz * qz);
    const r01 = n2 * (qx * qy - qw * qz);
    const r02 = n2 * (qx * qz + qw * qy);
    const r10 = n2 * (qx * qy + qw * qz);
    const r11 = 1 - n2 * (qx * qx + qz * qz);
    const r12 = n2 * (qy * qz - qw * qx);
    const r20 = n2 * (qx * qz - qw * qy);
    const r21 = n2 * (qy * qz + qw * qx);
    const r22 = 1 - n2 * (qx * qx + qy * qy);
    velX = r00 * vx + r01 * vy + r02 * vz;
    velY = r10 * vx + r11 * vy + r12 * vz;
    velZ = r20 * vx + r21 * vy + r22 * vz;
    relX = vx - (r00 * wx + r10 * wy + r20 * wz);
    relY = vy - (r01 * wx + r11 * wy + r21 * wz);
    relZ = vz - (r02 * wx + r12 * wy + r22 * wz);
    airspeed = Math.sqrt(relX * relX + relY * relY + relZ * relZ);
  };

  const refArea = airframe.ref.area;
  /** Output sample of a state. Observes it first. */
  const sampleOf = (s: Float64Array, t: number, wx: number, wy: number, wz: number): FlightSample => {
    observe(s, wx, wy, wz);
    let alpha = 0;
    let beta = 0;
    let cl = 0;
    let cd = 0;
    if (airspeed > MIN_AIRSPEED) {
      alpha = Math.atan2(-relY, relX);
      beta = Math.asin(Math.max(-1, Math.min(1, relZ / airspeed)));
      if (aero && refArea > 0) {
        rel[0] = relX;
        rel[1] = relY;
        rel[2] = relZ;
        om[0] = s[OX];
        om[1] = s[OX + 1];
        om[2] = s[OX + 2];
        aeroLoads(airframe, rel, om, air, loads);
        const f = loads.force;
        const qs = 0.5 * air.rho * airspeed * airspeed * refArea;
        // Drag along the relative wind; lift perpendicular to it in the plane of symmetry (the tunnel's axes).
        cd = -(f[0] * relX + f[1] * relY + f[2] * relZ) / (airspeed * qs);
        cl = (f[0] * Math.sin(alpha) + f[1] * Math.cos(alpha)) / qs;
      }
    }
    return {
      t,
      pos: [s[PX], s[PX + 1], s[PX + 2]],
      quat: [s[QX], s[QX + 1], s[QX + 2], s[QX + 3]],
      vel: [velX, velY, velZ],
      omega: [s[OX], s[OX + 1], s[OX + 2]],
      airspeed,
      alpha,
      beta,
      cl,
      cd,
      wind: [wx, wy, wz],
    };
  };

  /** State between two step states: linear, with the quaternion renormalised (they are 1 ms apart). */
  const blend = (a: Float64Array, b: Float64Array, f: number, out: Float64Array): void => {
    for (let i = 0; i < N; i++) out[i] = a[i] + (b[i] - a[i]) * f;
    const qn = 1 / Math.sqrt(out[QX] * out[QX] + out[QX + 1] * out[QX + 1] + out[QX + 2] * out[QX + 2] + out[QX + 3] * out[QX + 3]);
    out[QX] *= qn;
    out[QX + 1] *= qn;
    out[QX + 2] *= qn;
    out[QX + 3] *= qn;
  };

  /* ---- initial state ---- */
  const s = new Float64Array(N);
  const before = new Float64Array(N);
  const mid = new Float64Array(N);
  const q0 = launchAttitude(launch);
  const v0 = quatRotateInv(q0, launchVelocity(launch));
  s[PX] = env.launch[0];
  s[PX + 1] = env.launch[1];
  s[PX + 2] = env.launch[2];
  s[VX] = v0[0];
  s[VX + 1] = v0[1];
  s[VX + 2] = v0[2];
  s[QX] = q0[0];
  s[QX + 1] = q0[1];
  s[QX + 2] = q0[2];
  s[QX + 3] = q0[3];
  if (opts.omega0) {
    s[OX] = opts.omega0[0];
    s[OX + 1] = opts.omega0[1];
    s[OX + 2] = opts.omega0[2];
  }

  const wind0: Triple = [0, 0, 0];
  const wind1: Triple = [0, 0, 0];
  const probe: Triple = [0, 0, 0];
  probe[0] = s[PX];
  probe[1] = s[PX + 1];
  probe[2] = s[PX + 2];
  field.sample(probe, 0, wind0);

  const samples: FlightSample[] = [];
  const events: FlightEvent[] = [];
  const addEvent = (kind: FlightEventKind, t: number, st: Float64Array): void => {
    events.push({ t, kind, pos: [st[PX], st[PX + 1], st[PX + 2]] });
  };

  samples.push(sampleOf(s, 0, wind0[0], wind0[1], wind0[2]));
  addEvent('launch', 0, s);

  const wing = airframe.surfaces.find((sf) => sf.role === 'wing' || sf.role === 'center') ?? airframe.surfaces[0];
  const stallAngle = wing ? wing.alphaStall : Math.PI / 2;
  // |alpha| > angle  <=>  |relY| > relX tan(angle), for angles below 90 degrees; alpha = atan2(-relY, relX).
  const tanStall = Math.tan(Math.min(stallAngle, 89 * DEG));
  const tanRecover = Math.tan(Math.max(Math.min(stallAngle, 89 * DEG) - RECOVER_BELOW_STALL, 0));
  let stalled = false;
  let stallCount = 0;
  const checkStall = (t: number, st: Float64Array): void => {
    if (!aero || airspeed <= MIN_AIRSPEED) return;
    const up = Math.abs(relY);
    if (!stalled && up > relX * tanStall) {
      stalled = true;
      stallCount++;
      addEvent('stall', t, st);
    } else if (stalled && up < relX * tanRecover) {
      stalled = false;
      addEvent('recover', t, st);
    }
  };
  checkStall(0, s);

  // Running metrics.
  let pathLength = 0;
  let airspeedTime = 0;
  let maxHeight = s[PX + 1];
  let maxSpeed = Math.sqrt(velX * velX + velY * velY + velZ * velZ);
  let apexT = 0;
  const apex: Triple = [s[PX], s[PX + 1], s[PX + 2]];
  // Tumble detection: body rotation in pitch and roll, and whether the air came from behind during the current pitch turn.
  let pitchTurn = 0;
  let rollTurn = 0;
  let flownBackward = false;

  let outcome: FlightResult['outcome'] = 'timeout';
  let touch: Vec3 | null = null;
  let tEnd = 0;
  // The state and wind the flight ended with (the last good ones if the loop is left early).
  let endState = s;
  const endWind: Triple = [wind0[0], wind0[1], wind0[2]];
  let step = 0;
  let nextSample = 1;
  let ended = gaps(s, gapNow) < 0;
  if (ended) {
    // Released already touching something: no flight.
    outcome = 'ground';
    touch = [s[PX], s[PX + 1], s[PX + 2]];
  }

  while (!ended) {
    const tBefore = step * dt;
    before.set(s);
    const airspeedBefore = airspeed;
    const omegaBefore = Math.sqrt(s[OX] * s[OX] + s[OX + 1] * s[OX + 1] + s[OX + 2] * s[OX + 2]);

    // Wind at the end of the step, at the position a straight step would reach.
    probe[0] = s[PX] + velX * dt;
    probe[1] = s[PX + 1] + velY * dt;
    probe[2] = s[PX + 2] + velZ * dt;
    field.sample(probe, tBefore + dt, wind1);
    const ax = (wind1[0] - wind0[0]) / dt;
    const ay = (wind1[1] - wind0[1]) / dt;
    const az = (wind1[2] - wind0[2]) / dt;

    const rate = stiffness * (airspeedBefore + omegaBefore * reach) * dt;
    if (rate <= GUARD_LIMIT) {
      rk4(s, dt, wind0[0], wind0[1], wind0[2], ax, ay, az);
    } else {
      const parts = Math.min(MAX_SUBSTEPS, Math.ceil(rate / GUARD_LIMIT));
      const h = dt / parts;
      for (let j = 0; j < parts; j++) {
        const at = j * h;
        rk4(s, h, wind0[0] + ax * at, wind0[1] + ay * at, wind0[2] + az * at, ax, ay, az);
      }
    }
    step++;
    const tNow = step * dt;
    if (!(Math.abs(s[PX]) + Math.abs(s[PX + 1]) + Math.abs(s[PX + 2]) + Math.abs(s[OX]) + Math.abs(s[OX + 1]) + Math.abs(s[OX + 2]) < DIVERGED)) {
      // The numbers have run away (an airframe far outside what the model was built for). End the flight at
      // the last good state instead of handing out NaN.
      s.set(before);
      tEnd = tBefore;
      outcome = 'ground';
      touch = [s[PX], s[PX + 1], s[PX + 2]];
      ended = true;
      break;
    }

    // First touch inside this step: the earliest crossing of any contact point through any surface,
    // interpolated linearly between the two step states (doc 02 section 7).
    let fraction = 1;
    let final = s;
    if (nearSomething(s) && gaps(s, gapNow) < 0) {
      gaps(before, gapBefore);
      let hitPoint = 0;
      let hitSurface = SURFACE_GROUND;
      for (let i = 0; i < contactCount * SURFACES; i++) {
        if (gapNow[i] >= 0) continue;
        const was = gapBefore[i];
        const f = was > 0 ? was / (was - gapNow[i]) : 0;
        if (f < fraction) {
          fraction = f;
          hitPoint = Math.floor(i / SURFACES);
          hitSurface = i % SURFACES;
        }
      }
      blend(before, s, fraction, mid);
      final = mid;
      ended = true;
      outcome = hitSurface === SURFACE_GROUND ? 'ground' : hitSurface === SURFACE_CEILING ? 'ceiling' : 'wall';
      touch = contactPointAt(mid, hitPoint);
    }
    tEnd = tBefore + fraction * dt;

    // Output samples that fall inside this step.
    for (;;) {
      const ts = nextSample / sampleHz;
      if (ts >= tEnd - TIME_EPS) break;
      const f = (ts - tBefore) / dt;
      blend(before, s, f, stage);
      const at = ts - tBefore;
      samples.push(sampleOf(stage, ts, wind0[0] + ax * at, wind0[1] + ay * at, wind0[2] + az * at));
      nextSample++;
    }

    // The state at the end of the step (or at the touch).
    const span = tEnd - tBefore;
    endState = final;
    endWind[0] = wind0[0] + ax * span;
    endWind[1] = wind0[1] + ay * span;
    endWind[2] = wind0[2] + az * span;
    observe(final, endWind[0], endWind[1], endWind[2]);
    const dx = final[PX] - before[PX];
    const dy = final[PX + 1] - before[PX + 1];
    const dz = final[PX + 2] - before[PX + 2];
    pathLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
    airspeedTime += 0.5 * (airspeedBefore + airspeed) * span;
    const groundSpeed = Math.sqrt(velX * velX + velY * velY + velZ * velZ);
    if (groundSpeed > maxSpeed) maxSpeed = groundSpeed;
    if (final[PX + 1] > maxHeight) {
      maxHeight = final[PX + 1];
      apexT = tEnd;
      apex[0] = final[PX];
      apex[1] = final[PX + 1];
      apex[2] = final[PX + 2];
    }
    checkStall(tEnd, final);

    pitchTurn += 0.5 * (before[OX + 2] + final[OX + 2]) * span;
    rollTurn += 0.5 * (before[OX] + final[OX]) * span;
    if (relX < 0 && airspeed > MIN_AIRSPEED) flownBackward = true;
    if (pitchTurn >= TWO_PI || pitchTurn <= -TWO_PI) {
      // A full turn in pitch with the air never coming from behind is a loop, not a tumble.
      if (flownBackward) addEvent('tumble', tEnd, final);
      pitchTurn -= pitchTurn > 0 ? TWO_PI : -TWO_PI;
      flownBackward = false;
    }
    if (rollTurn >= TWO_PI || rollTurn <= -TWO_PI) {
      addEvent('tumble', tEnd, final);
      rollTurn -= rollTurn > 0 ? TWO_PI : -TWO_PI;
    }

    if (ended) break;
    if (tNow >= maxTime - TIME_EPS) {
      outcome = 'timeout';
      ended = true;
      break;
    }
    wind0[0] = wind1[0];
    wind0[1] = wind1[1];
    wind0[2] = wind1[2];
  }

  /* ---- final sample, events, metrics ---- */
  if (tEnd > 0) samples.push(sampleOf(endState, tEnd, endWind[0], endWind[1], endWind[2]));
  const end = samples[samples.length - 1];
  if (apexT > 0 && maxHeight - env.launch[1] >= MIN_APEX_RISE) events.push({ t: apexT, kind: 'apex', pos: [apex[0], apex[1], apex[2]] });
  events.push({ t: tEnd, kind: outcome, pos: touch ?? end.pos });
  events.sort((a, b) => a.t - b.t);

  const landing = touch ?? end.pos;
  const downrange = landing[0] - env.launch[0];
  const lateral = landing[2] - env.launch[2];
  const meanAirspeed = tEnd > 0 ? airspeedTime / tEnd : end.airspeed;
  const glide = aero ? findSteadyGlide(samples) : null;
  const metrics: FlightMetrics = {
    distance: Math.hypot(downrange, lateral),
    downrange,
    lateral,
    airtime: tEnd,
    maxHeight,
    maxSpeed,
    meanAirspeed,
    pathLength,
    glideRatio: glide ? glide.glideRatio : null,
    sinkRate: glide ? glide.sinkRate : null,
    glideAlpha: glide ? glide.alpha : null,
    glideSpeed: glide ? glide.speed : null,
    stallCount,
    landingSpeed: Math.hypot(end.vel[0], end.vel[1], end.vel[2]),
    reynolds: (air.rho * meanAirspeed * airframe.ref.mac) / air.mu,
  };

  const result: FlightResult = { seed, dt, sampleHz, samples, events, metrics, diagnosis: [], outcome };
  result.diagnosis = diagnose(result, airframe, launch, env);
  return result;
}
