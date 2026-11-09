/**
 * The wind field of one flight: mean profile, flow over terrain, thermals, gust events and turbulence.
 * Model: docs/research/03-wind-atmosphere.md sections 2 to 5 and 8.
 *
 * SAMPLING CONTRACT (see `WindField` in src/core/types.ts). `mean` is a pure function of position and time.
 * `sample` adds turbulence, which is a random process stepped along the path that successive calls trace:
 * every call with a later time than the previous one advances the gust filters by the distance the sample
 * point moved through the air since then (Taylor's frozen turbulence, doc 03 section 3.3). The integrator
 * calls it once per time step with the plane's position. The numbers are fully determined by the seed and by
 * the sequence of (position, time) pairs; a different step size is a different sequence and therefore a
 * different realisation of the same statistics.
 */
import { cliffTopHeight, terrainHeight } from '../env';
import { clamp, createRng, DEG, hash32, smoothstep } from '../math';
import type { Conditions, Environment, Vec3, WindField, WindSpec } from '../types';
import { thermalUpdraft } from './thermal';
import {
  drydenLengthU, drydenOutput, frictionVelocity, lengthScaleHeight, REFERENCE_HEIGHT, SIGMA_OVER_USTAR, stepDryden, stepOu,
} from './turbulence';

/** Defensive clamp of the log law: z_eff >= 1.5 z0 + 0.05 m (doc 03 section 2.1). */
const PROFILE_FLOOR_Z0 = 1.5;
const PROFILE_FLOOR = 0.05;
/**
 * Vertical gusts fade to zero over the last 0.5 m above the ground (doc 03 section 3.3). Indoors the same
 * distance fades the wind component normal to every wall, floor and ceiling, so no air crosses them.
 */
const SURFACE_FADE = 0.5;
/** The gust field is swept at no less than max(0.3 m/s, sigma_u) (doc 03 section 3.3). */
const MIN_SAMPLING_SPEED = 0.3;
/** Height where gust-event statistics are taken, metres (doc 03 section 4: values "at 2 m"). */
const GUST_HEIGHT = 2;
/**
 * Gust events (doc 03 section 4, "App use"; a design choice there too): amplitude 1.5 sigma_u and a mean
 * interval of 30 - 90 s at gustiness 0.5. Gustiness scales the amplitude up and the interval down in
 * proportion, so 1 gives 3 sigma_u every 15 - 45 s.
 */
const GUST_SIGMAS_AT_FULL = 3;
const GUST_INTERVAL_AT_FULL = 30;
const GUST_INTERVAL_SPREAD: readonly [number, number] = [0.5, 1.5];
/** Rise distance d_m = L_u / 2, travelled at the mean wind (doc 03 section 4). */
const GUST_RISE_LENGTHS = 0.5;
/** The rise time is computed with at least this wind speed, m/s, so that it stays finite in light air (design choice). */
const GUST_MIN_ADVECTION = 0.5;
/** How long a gust holds its peak before it fades the way it came, seconds (design choice; doc 03 gives 5 - 10 s for a door draft). */
const GUST_HOLD: readonly [number, number] = [2, 6];
/** Gust events are scheduled this far ahead, seconds: ten times the longest flight. */
const GUST_HORIZON = 600;
const MIN_GUSTINESS = 0.01;
/**
 * Separation zone on a cliff top in onshore wind: mean wind x 0.5 and sigma x 2 within about 2 cliff heights
 * downstream of the edge and half a cliff height up (doc 03 section 5.3 b). The zone is faded in over the
 * first tenth of a cliff height behind the edge and out between 2 and 3 heights, and between half and one
 * height up, to keep the field continuous (design choice).
 */
const BUBBLE_WIND_LOSS = 0.5;
const BUBBLE_ONSET = 0.1;
const BUBBLE_LENGTH: readonly [number, number] = [2, 3];
const BUBBLE_HEIGHT: readonly [number, number] = [0.5, 1];

type Out = [number, number, number];

/**
 * The wind of an environment for one flight: the environment's own wind, with the player's speed, direction
 * and gustiness where the environment allows changes.
 */
export function resolveWind(env: Environment, conditions: Conditions): WindSpec {
  if (!env.adjustableWind) return env.wind;
  return {
    ...env.wind,
    speed: clamp(conditions.windSpeed ?? env.wind.speed, 0, env.maxWind),
    towardDeg: conditions.windTowardDeg ?? env.wind.towardDeg,
    gustiness: clamp(conditions.gustiness ?? env.wind.gustiness, 0, 1),
  };
}

/**
 * Build the wind field for a flight.
 *
 * Mean wind. Outdoors (roughness > 0) the neutral log law U(h) = U10 ln(h / z0) / ln(10 / z0), with the
 * clamp of doc 03 section 2.1 and a linear fall to zero through the last centimetres so that the air is at
 * rest on the ground and below it. Indoors (roughness = 0) a uniform draft whose component normal to each
 * wall, the floor and the ceiling fades to zero over the last half metre.
 *
 * Terrain (uniform along z, so only the wind's x component is deflected):
 *  - hill: linear potential flow over a row of cosine ridges (section 5.3 a) with the log profile taken at the
 *    height above the local ground;
 *  - cliff: potential flow round a half cylinder (section 5.3 b) on the seaward side of the edge. The profile
 *    speed is taken at the height the local streamline has far out at sea, h = eta (1 - R² / r²), which keeps
 *    the field divergence-free and at rest on the surface. Over the cliff top the flow runs level at the speed
 *    it has above the edge, slowed inside the separation zone when the wind is onshore.
 *
 * Thermals: Allen scaling with the zero-net-flux shape (section 5.2), leaning downwind with U(h) t.
 * Gust events: 1-cosine rises of the whole mean flow, scheduled from the seed (section 4).
 * Turbulence: section 3.4 recurrences; see the sampling contract at the top of this file.
 */
export function createWindField(spec: WindSpec, seed: number, env: Environment): WindField {
  // Two independent streams: the set-up draws never shift when the number of turbulence steps changes.
  const setup = createRng(hash32(`wind-setup:${seed}`));
  const noise = createRng(hash32(`wind-noise:${seed}`));

  const drawnDeg = setup.range(0, 360);
  const toward = (spec.towardDeg ?? drawnDeg) * DEG;
  const dirX = Math.cos(toward);
  const dirZ = Math.sin(toward);
  const speed = Math.max(0, spec.speed);
  const z0 = Math.max(0, spec.roughness);
  const outdoors = z0 > 0;
  const terrain = env.terrain;
  const bounds = env.bounds;
  const thermals = spec.thermals;
  const cliffTop = terrain.kind === 'cliff' ? cliffTopHeight(terrain) : 0;

  /* ---- mean profile ---- */
  const logSpan = outdoors ? Math.log(REFERENCE_HEIGHT / z0) : 1;
  const zFloor = PROFILE_FLOOR_Z0 * z0 + PROFILE_FLOOR;
  const floorRatio = outdoors ? Math.log(zFloor / z0) / logSpan : 1;
  /** U(h) / U10 outdoors; 1 indoors. */
  const profile = (h: number): number => {
    if (!outdoors) return 1;
    if (h <= 0) return 0;
    return h < zFloor ? (h / zFloor) * floorRatio : Math.log(h / z0) / logSpan;
  };

  /* ---- turbulence intensities ---- */
  let sigU = 0;
  let sigV = 0;
  let sigW = 0;
  /** 0 = Dryden scales from the height; otherwise the fixed Ornstein-Uhlenbeck length. */
  let ouLength = 0;
  if (spec.turbulence) {
    [sigU, sigV, sigW] = spec.turbulence.sigma;
    ouLength = Math.max(spec.turbulence.length, 1e-3);
  } else if (outdoors) {
    const uStar = frictionVelocity(speed, z0);
    sigU = SIGMA_OVER_USTAR[0] * uStar;
    sigV = SIGMA_OVER_USTAR[1] * uStar;
    sigW = SIGMA_OVER_USTAR[2] * uStar;
  }
  const turbulent = sigU > 0 || sigV > 0 || sigW > 0;
  const dryden = ouLength === 0;

  /* ---- gust events: the mean flow is multiplied by 1 + gustRise * shape(t) ---- */
  const gustStart: number[] = [];
  const gustRamp: number[] = [];
  const gustHold: number[] = [];
  const gustiness = clamp(spec.gustiness, 0, 1);
  const gustRefSpeed = speed * profile(GUST_HEIGHT);
  const gustRise = gustRefSpeed > 0 ? (GUST_SIGMAS_AT_FULL * gustiness * sigU) / gustRefSpeed : 0;
  if (gustRise > 0 && gustiness >= MIN_GUSTINESS) {
    const lu = dryden ? drydenLengthU(lengthScaleHeight(GUST_HEIGHT, z0)) : ouLength;
    const ramp = (GUST_RISE_LENGTHS * lu) / Math.max(gustRefSpeed, GUST_MIN_ADVECTION);
    const gap = GUST_INTERVAL_AT_FULL / gustiness;
    let at = setup.range(0, gap);
    while (at < GUST_HORIZON) {
      const hold = setup.range(GUST_HOLD[0], GUST_HOLD[1]);
      gustStart.push(at);
      gustRamp.push(ramp);
      gustHold.push(hold);
      at += 2 * ramp + hold + gap * setup.range(GUST_INTERVAL_SPREAD[0], GUST_INTERVAL_SPREAD[1]);
    }
  }
  let gustHint = 0;
  /** Mean-flow multiplier at time t. The hint only speeds up the search; the value depends on t alone. */
  const gustFactor = (t: number): number => {
    const n = gustStart.length;
    if (n === 0) return 1;
    let i = gustHint;
    while (i > 0 && t < gustStart[i]) i--;
    while (i + 1 < n && t >= gustStart[i + 1]) i++;
    gustHint = i;
    const since = t - gustStart[i];
    if (since <= 0) return 1;
    const ramp = gustRamp[i];
    const hold = gustHold[i];
    let shape: number;
    if (since < ramp) shape = 0.5 * (1 - Math.cos((Math.PI * since) / ramp));
    else if (since < ramp + hold) shape = 1;
    else if (since < 2 * ramp + hold) shape = 0.5 * (1 + Math.cos((Math.PI * (since - ramp - hold)) / ramp));
    else shape = 0;
    return 1 + gustRise * shape;
  };

  /* ---- mean flow at a point: writes mX, mY, mZ, zeta (height above the local ground) and bubble ---- */
  let mX = 0;
  let mY = 0;
  let mZ = 0;
  let zeta = 0;
  let bubble = 0;
  const meanAt = (x: number, y: number, z: number, t: number): void => {
    const reference = speed * gustFactor(t);
    bubble = 0;
    switch (terrain.kind) {
      case 'flat': {
        zeta = y;
        const u = reference * profile(y);
        mX = u * dirX;
        mY = 0;
        mZ = u * dirZ;
        break;
      }
      case 'hill': {
        const k = Math.PI / terrain.halfWidth;
        zeta = y - terrainHeight(terrain, x);
        const u = reference * profile(zeta);
        const ux = u * dirX;
        // u' = U a k cos(kx) exp(-k zeta), w = -U a k sin(kx) exp(-k zeta), x measured from the crest.
        const phase = k * (x - terrain.crestX);
        const strength = 0.5 * terrain.height * k * Math.exp(-k * (zeta > 0 ? zeta : 0));
        mX = ux * (1 + strength * Math.cos(phase));
        mY = -ux * strength * Math.sin(phase);
        mZ = u * dirZ;
        break;
      }
      case 'cliff': {
        const radius = terrain.height;
        const xi = x - terrain.edgeX;
        // Height above the cliff top.
        const above = y - cliffTop;
        if (xi >= 0) {
          // Seaward of the edge: cylinder centred at sea level under the edge.
          const eta = above + radius;
          const r2 = xi * xi + eta * eta;
          zeta = y - terrainHeight(terrain, x);
          if (eta <= 0 || r2 <= radius * radius) {
            mX = 0;
            mY = 0;
            mZ = 0;
            break;
          }
          const ratio = (radius * radius) / r2;
          const u = reference * profile(eta * (1 - ratio));
          const ux = u * dirX;
          // u = U (1 - (R/r)² cos 2 phi), w = -U (R/r)² sin 2 phi.
          mX = ux * (1 - (ratio * (xi * xi - eta * eta)) / r2);
          mY = (-ux * ratio * 2 * xi * eta) / r2;
          mZ = u * dirZ;
        } else {
          zeta = above;
          if (above <= 0) {
            mX = 0;
            mY = 0;
            mZ = 0;
            break;
          }
          const eta = radius + above;
          const ratio = (radius * radius) / (eta * eta);
          let u = reference * profile(eta * (1 - ratio));
          if (dirX < 0) {
            const behind = -xi / radius;
            bubble =
              smoothstep(0, BUBBLE_ONSET, behind) *
              (1 - smoothstep(BUBBLE_LENGTH[0], BUBBLE_LENGTH[1], behind)) *
              (1 - smoothstep(BUBBLE_HEIGHT[0], BUBBLE_HEIGHT[1], above / radius));
            u *= 1 - BUBBLE_WIND_LOSS * bubble;
          }
          mX = u * dirX * (1 + ratio);
          mY = 0;
          mZ = u * dirZ;
        }
        break;
      }
    }
    if (thermals.length > 0 && zeta > 0) {
      // The column leans downwind: its centre at this height has drifted with the (gust-free) mean wind.
      const drift = speed * profile(zeta) * t;
      for (let i = 0; i < thermals.length; i++) {
        const th = thermals[i];
        const dx = x - th.x - drift * dirX;
        const dz = z - th.z - drift * dirZ;
        mY += thermalUpdraft(th, zeta, Math.sqrt(dx * dx + dz * dz));
      }
    }
  };

  /** Indoors: no flow through walls, floor or ceiling, and none outside the room. Open air without a profile: none below the ground. */
  const confine = (x: number, y: number, z: number, out: Out): void => {
    if (bounds) {
      const dx = Math.min(x - bounds.xMin, bounds.xMax - x);
      const dy = Math.min(y, bounds.ceiling - y);
      const dz = Math.min(z - bounds.zMin, bounds.zMax - z);
      if (dx <= 0 || dy <= 0 || dz <= 0) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        return;
      }
      if (dx < SURFACE_FADE) out[0] *= dx / SURFACE_FADE;
      if (dy < SURFACE_FADE) out[1] *= dy / SURFACE_FADE;
      if (dz < SURFACE_FADE) out[2] *= dz / SURFACE_FADE;
    } else if (zeta <= 0) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
    }
  };

  /* ---- turbulence state: [u, v1, v2, w1, w2] (Dryden) or [u, v, w] (Ornstein-Uhlenbeck), unit variance ---- */
  const state = new Float64Array(5);
  // Start from the stationary distribution so the series is stationary from t = 0 (doc 03 section 3.4).
  if (turbulent) for (let i = 0; i < (dryden ? 5 : 3); i++) state[i] = noise.gauss();
  const samplingFloor = Math.max(MIN_SAMPLING_SPEED, sigU);
  let started = false;
  let lastT = 0;
  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;

  const sample = (pos: Vec3, t: number, out: Out = [0, 0, 0]): Vec3 => {
    const x = pos[0];
    const y = pos[1];
    const z = pos[2];
    meanAt(x, y, z, t);
    let wx = mX;
    let wy = mY;
    let wz = mZ;
    if (turbulent) {
      if (!started) {
        started = true;
        lastT = t;
        lastX = x;
        lastY = y;
        lastZ = z;
      } else if (t > lastT) {
        const elapsed = t - lastT;
        // Distance the sample point moved through the air.
        const rx = x - lastX - mX * elapsed;
        const ry = y - lastY - mY * elapsed;
        const rz = z - lastZ - mZ * elapsed;
        let ds = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const least = samplingFloor * elapsed;
        if (ds < least) ds = least;
        if (dryden) {
          const h = lengthScaleHeight(zeta, z0);
          const tauH = ds / drydenLengthU(h);
          state[0] = stepOu(state[0], tauH, noise.gauss());
          stepDryden(state, 1, tauH, noise.gauss(), noise.gauss());
          stepDryden(state, 3, ds / h, noise.gauss(), noise.gauss());
        } else {
          const step = ds / ouLength;
          state[0] = stepOu(state[0], step, noise.gauss());
          state[1] = stepOu(state[1], step, noise.gauss());
          state[2] = stepOu(state[2], step, noise.gauss());
        }
        lastT = t;
        lastX = x;
        lastY = y;
        lastZ = z;
      }
      const gain = 1 + bubble;
      let gu = gain * sigU * state[0];
      let gv = gain * sigV * (dryden ? drydenOutput(state, 1) : state[1]);
      let gw = gain * sigW * (dryden ? drydenOutput(state, 3) : state[2]);
      if (outdoors) {
        // Horizontal gusts die with the mean wind in the last centimetres, vertical ones over the last half metre.
        const near = zeta <= 0 ? 0 : zeta < zFloor ? zeta / zFloor : 1;
        gu *= near;
        gv *= near;
        gw *= zeta <= 0 ? 0 : zeta < SURFACE_FADE ? zeta / SURFACE_FADE : 1;
      }
      // u along the mean wind, v across it (to its right seen from above), w up.
      wx += gu * dirX - gv * dirZ;
      wy += gw;
      wz += gu * dirZ + gv * dirX;
    }
    out[0] = wx;
    out[1] = wy;
    out[2] = wz;
    confine(x, y, z, out);
    return out;
  };

  const mean = (pos: Vec3, t: number, out: Out = [0, 0, 0]): Vec3 => {
    meanAt(pos[0], pos[1], pos[2], t);
    out[0] = mX;
    out[1] = mY;
    out[2] = mZ;
    confine(pos[0], pos[1], pos[2], out);
    return out;
  };

  return { sample, mean };
}
