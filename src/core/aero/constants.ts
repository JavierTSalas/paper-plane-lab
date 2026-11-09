import type { Air } from '../types';

/**
 * Indoor air at 20 C: rho 1.204 kg/m³, mu 1.813e-5 Pa s, so nu = 1.506e-5 m²/s
 * (docs/research/02-flight-dynamics-validation.md header and section 9).
 */
export const STANDARD_AIR: Air = { rho: 1.204, mu: 1.813e-5 };
