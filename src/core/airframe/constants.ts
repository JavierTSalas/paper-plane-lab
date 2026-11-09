/** Standard gravity, m/s² (docs/research/02-flight-dynamics-validation.md section 9). */
export const STANDARD_GRAVITY = 9.80665;

/**
 * Air density used for the apparent (added) mass, kg/m³: indoor air at 20 C (doc 02 section 9).
 * The airframe is built before the environment is known; the few percent that density varies between
 * environments are far inside the uncertainty of the added-mass estimate itself.
 */
export const REFERENCE_AIR_DENSITY = 1.204;

/** Spanwise strips per panel (ARCHITECTURE.md section 6.1; doc 02 section 2 asks for at least 6 per semispan). */
export const WING_STRIPS = 10;
export const WALL_STRIPS = 3;
export const WINGLET_STRIPS = 3;

/** Fuselage walls: normal-force exposure 0.5 at spread 0 rising to 1 at this spread (ARCHITECTURE.md section 6.1). */
export const EXPOSURE_FULL_SPREAD_DEG = 60;
/** Fuselage walls: one wetted face each below this spread (ARCHITECTURE.md section 6.1) ... */
export const WETTED_ONE_FACE_SPREAD_DEG = 20;
/** ... rising smoothly to two faces at this spread, so that friction has no jump while a keel is opened (design choice). */
export const WETTED_TWO_FACE_SPREAD_DEG = 40;

/**
 * A fuselage wall or winglet uses its own low-aspect-ratio constants when it stands at least this far out of
 * the wing plane, and blends into the wing's constants as it folds flat into it (design choice: keeps the
 * model continuous between "winglet at 0 degrees" and "no winglet", and between an open keel and no keel).
 */
export const OWN_SURFACE_ANGLE_DEG = 45;

/** Sample lines per panel for the layer count. */
export const LAYER_SAMPLE_LINES = 24;
