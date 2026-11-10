/**
 * The intro's two darts and the classroom throws. Pure.
 */
import { getPreset, makeDesign, presetPaper, DEFAULT_PRESET_ID } from '../../core/designs';
import { getEnvironment } from '../../core/env';
import { simulateFlight } from '../../core/sim';
import type { Airframe, Conditions, Environment, FlightResult, Launch, PlaneDesign } from '../../core/types';
import { STILL_AIR_SEED } from '../fly/flight';

/** The intro happens in the classroom: still air, so the same throw always flies the same way. */
export const INTRO_ENV_ID = 'classroom';

export const introEnv = (): Environment => getEnvironment(INTRO_ENV_ID);
export const INTRO_CONDITIONS: Conditions = { envId: INTRO_ENV_ID };

/** A throw in the intro classroom. Still air and a fixed seed: the same throw always flies the same way. */
export function flyIntro(airframe: Airframe, launch: Launch): FlightResult {
  return simulateFlight(airframe, launch, introEnv(), INTRO_CONDITIONS, STILL_AIR_SEED);
}

/** Paper colour of the Professor's own dart (a PAPER_COLORS id). */
export const WREN_COLOR = 'kraft';

/**
 * The Professor's gentle demonstration throw: a level push at 6 m/s, inside the casual 5-11 m/s band of
 * THROW_LIMITS. In the classroom it glides cleanly and lands short of the far wall.
 */
export const WREN_LAUNCH: Launch = {
  speed: 6,
  pitchDeg: 0,
  yawDeg: 0,
  rollDeg: 0,
  aoaDeg: 0,
};

/**
 * Where the player's throw controls start: as firm as the Professor's throw and a touch upward. Untouched, it
 * glides cleanly and lands just short of his dart; half a metre per second more reaches the far wall.
 */
export const PLAYER_START_LAUNCH: Launch = {
  speed: 6,
  pitchDeg: 2,
  yawDeg: 0,
  rollDeg: 0,
  aoaDeg: 0,
};

function dartPreset(): NonNullable<ReturnType<typeof getPreset>> {
  const p = getPreset(DEFAULT_PRESET_ID);
  if (!p) throw new Error(`Preset ${DEFAULT_PRESET_ID} is missing`);
  return p;
}

let wrenDesign: PlaneDesign | null = null;

/** Professor Wren's Classic Dart on kraft A4. One shared object, so memoised builds hit their cache. */
export function getWrenDesign(): PlaneDesign {
  if (!wrenDesign) {
    const preset = dartPreset();
    wrenDesign = makeDesign(preset, presetPaper(preset, { front: WREN_COLOR }), { id: 'wren-classic-dart', name: "Professor Wren's dart" });
  }
  return wrenDesign;
}

/** The player's first dart: the same Classic Dart on the paper they chose. */
export function makePlayerDesign(planeId: string, colorId: string, author?: string): PlaneDesign {
  const preset = dartPreset();
  return makeDesign(preset, presetPaper(preset, { front: colorId }), {
    id: planeId,
    author: author || undefined,
  });
}
