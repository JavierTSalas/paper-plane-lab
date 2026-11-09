/**
 * Turbulence building blocks: the exact discrete recurrences of docs/research/03-wind-atmosphere.md
 * section 3.4, the Dryden low-altitude length scales (section 3.1) and the surface-layer similarity
 * intensities (section 3.2). All states are scaled to unit variance, so sigma and L may change from step to
 * step without a transient.
 */

/** Von Karman constant (doc 03 section 2.1). */
export const KAPPA = 0.4;
/** Reference height of the mean wind, metres (doc 03 section 8: z_ref = 10 m). */
export const REFERENCE_HEIGHT = 10;
/** sigma_u, sigma_v, sigma_w over the friction velocity u* in neutral flow (doc 03 section 3.2, [S21]). */
export const SIGMA_OVER_USTAR: readonly [number, number, number] = [2.4, 1.9, 1.25];
/** Dryden low-altitude scale L_u = h / (0.177 + 0.0027 h)^1.2 with h in metres (doc 03 section 3.1, SI form). */
const DRYDEN_A = 0.177;
const DRYDEN_B_PER_M = 0.0027;
const DRYDEN_EXPONENT = 1.2;
/** Length scales are frozen outside this height band, metres (doc 03 section 3.3 clamps). */
const LENGTH_HEIGHT_FLOOR = 1;
const LENGTH_HEIGHT_FLOOR_Z0 = 10;
const LENGTH_HEIGHT_CEILING = 300;
/** Below this step size the plain covariance formulas lose their digits; the series takes over (doc 03 section 3.4). */
const SERIES_BELOW = 1e-3;
const SQRT3 = Math.sqrt(3);

/** Friction velocity u* of the neutral log law from the 10 m wind and the roughness length (doc 03 section 2.1). */
export function frictionVelocity(u10: number, z0: number): number {
  return z0 > 0 ? (KAPPA * u10) / Math.log(REFERENCE_HEIGHT / z0) : 0;
}

/** Height used for the Dryden length scales: clamp(h, max(1 m, 10 z0), 300 m) (doc 03 section 3.3). */
export function lengthScaleHeight(heightAboveGround: number, z0: number): number {
  const floor = Math.max(LENGTH_HEIGHT_FLOOR, LENGTH_HEIGHT_FLOOR_Z0 * z0);
  return heightAboveGround < floor ? floor : heightAboveGround > LENGTH_HEIGHT_CEILING ? LENGTH_HEIGHT_CEILING : heightAboveGround;
}

/**
 * Dryden longitudinal (and lateral) length scale L_u = L_v at an effective height, metres, MIL-F-8785C
 * convention (doc 03 section 3.1). The vertical scale L_w is the effective height itself.
 */
export function drydenLengthU(effectiveHeight: number): number {
  return effectiveHeight / (DRYDEN_A + DRYDEN_B_PER_M * effectiveHeight) ** DRYDEN_EXPONENT;
}

/**
 * One step of a unit-variance Ornstein-Uhlenbeck state over the distance x = ds / L (in length scales):
 * autocorrelation exp(-xi / L), exact for any step.
 */
export function stepOu(state: number, x: number, noise: number): number {
  const a = Math.exp(-x);
  return a * state + Math.sqrt(1 - a * a) * noise;
}

/**
 * One step of the two-state transverse Dryden filter over tau = ds / L (8785C L), in place on
 * state[offset], state[offset + 1]. The states have identity covariance; the step covariance Q = I - Phi Phi^T
 * is exact (doc 03 section 3.4).
 */
export function stepDryden(state: Float64Array, offset: number, tau: number, noise1: number, noise2: number): void {
  const e = Math.exp(-tau);
  const s1 = state[offset];
  const s2 = state[offset + 1];
  let q11: number;
  let q12: number;
  let q22: number;
  if (tau < SERIES_BELOW) {
    q11 = (4 / 3) * tau * tau * tau;
    q12 = 2 * tau * tau;
    q22 = 4 * tau - 8 * tau * tau;
  } else {
    const e2 = e * e;
    q11 = 1 - e2 * (1 + 2 * tau + 2 * tau * tau);
    q12 = 2 * e2 * tau * tau;
    q22 = 1 - e2 * (1 - 2 * tau + 2 * tau * tau);
  }
  // Cholesky factor of Q.
  const c11 = Math.sqrt(q11 > 0 ? q11 : 0);
  const c21 = c11 > 0 ? q12 / c11 : 0;
  const rest = q22 - c21 * c21;
  const c22 = Math.sqrt(rest > 0 ? rest : 0);
  state[offset] = e * ((1 + tau) * s1 + tau * s2) + c11 * noise1;
  state[offset + 1] = e * (-tau * s1 + (1 - tau) * s2) + c21 * noise1 + c22 * noise2;
}

/** Unit-variance output of the two-state filter: autocorrelation (1 - xi / (2 L)) exp(-xi / L). */
export function drydenOutput(state: Float64Array, offset: number): number {
  return 0.5 * (state[offset] + SQRT3 * state[offset + 1]);
}
