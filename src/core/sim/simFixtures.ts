/**
 * Planes and places for the flight tests. Test support only: not exported from the module index.
 */
import { buildAirframe } from '../airframe';
import { dartFixture, flyableGlider, GLIDER_TRIM, trimOf } from '../testing/fixtures';
import type { Airframe, Environment, Launch, TrimSpec } from '../types';

/**
 * The dart the flight tests throw: classic layer stack (centre of gravity well forward), a shallow keel and
 * 10 degrees of dihedral. The stock `flyableDart` fixture has a deeper keel of constant depth whose side force
 * sits ahead of the centre of gravity; it is not weathercock stable and slews off within a second in free
 * flight (see the lateral tests). This one holds its heading.
 */
export const SIM_DART_TRIM: TrimSpec = trimOf({ elevatorDeg: 3, elevatorChordFrac: 0.1 });
export const simDartModel = () => dartFixture({ layering: 'classic', keelDepth: 0.015, dihedralDeg: 10 });
export const simDart = (trim: Partial<TrimSpec> = {}): Airframe => buildAirframe(simDartModel(), { ...SIM_DART_TRIM, ...trim });

export const simGlider = (trim: Partial<TrimSpec> = {}): Airframe => buildAirframe(flyableGlider(), { ...GLIDER_TRIM, ...trim });

/** The same place with the air at rest: no draft, no turbulence, no gusts, no thermals. */
export const stillAir = (env: Environment): Environment => ({
  ...env,
  adjustableWind: false,
  wind: { speed: 0, towardDeg: 0, roughness: env.wind.roughness, turbulence: { sigma: [0, 0, 0], length: 1 }, gustiness: 0, thermals: [] },
});

/** The same place with the thrower on a tower: release point `height` metres up. */
export const releasedAt = (env: Environment, height: number): Environment => ({ ...env, launch: [env.launch[0], height, env.launch[2]] });

export const throwOf = (speed: number, pitchDeg: number, more: Partial<Launch> = {}): Launch => ({
  speed, pitchDeg, yawDeg: 0, rollDeg: 0, aoaDeg: 0, ...more,
});
