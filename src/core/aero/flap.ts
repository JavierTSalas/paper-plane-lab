/**
 * Thin-airfoil plain-flap effectiveness for a bent trailing edge
 * (docs/research/01-aerodynamics.md section 8; Glauert).
 * E = bent fraction of the chord, hinge angle theta_h = arccos(2E - 1).
 */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** tau = d(alpha_eff) / d(delta) = 1 - (theta_h - sin theta_h) / pi. 0 for no flap, 1 for an all-moving surface. */
export function flapTau(chordFrac: number): number {
  const theta = Math.acos(2 * clamp01(chordFrac) - 1);
  return 1 - (theta - Math.sin(theta)) / Math.PI;
}

/**
 * dCm(c/4) / d(delta) per radian in the textbook sign (delta > 0 = trailing edge down, nose-down moment):
 * -(1/2) sin theta_h (1 - cos theta_h).
 */
export function flapCmDelta(chordFrac: number): number {
  const theta = Math.acos(2 * clamp01(chordFrac) - 1);
  return -0.5 * Math.sin(theta) * (1 - Math.cos(theta));
}
