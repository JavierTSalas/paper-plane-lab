/**
 * Onboarding flow: steps, the two darts, the Professor's throw, and the resumable progress record.
 * Pure apart from the storage helpers, which never throw.
 */
import { getPreset, makeDesign, presetPaper, DEFAULT_PRESET_ID } from '../../core/designs';
import { getEnvironment } from '../../core/env';
import { simulateFlight, THROW_LIMITS } from '../../core/sim';
import type { Airframe, Conditions, Environment, FlightResult, Launch, PlaneDesign } from '../../core/types';
import { STILL_AIR_SEED } from '../fly/flight';

export const STEP_IDS = ['hello', 'watch-fold', 'watch-throw', 'your-fold', 'your-throw', 'graduate'] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEP_LABELS: Record<StepId, string> = {
  hello: 'Hello',
  'watch-fold': 'Watch the fold',
  'watch-throw': 'Watch the throw',
  'your-fold': 'Your fold',
  'your-throw': 'Your throw',
  graduate: 'Graduation',
};

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

/** Colours the player may pick for their first dart (PAPER_COLORS ids). Seven fit one row at 360 px. */
export const PLAYER_COLORS = ['white', 'butter', 'peach', 'coral', 'sky', 'mint', 'lilac'] as const;

/**
 * The Professor's gentle demonstration throw: a level push at 6 m/s, inside the casual 5-11 m/s band of
 * THROW_LIMITS. In the classroom it glides cleanly and lands short of the far wall.
 */
export const WREN_LAUNCH: Launch = { speed: 6, pitchDeg: 0, yawDeg: 0, rollDeg: 0, aoaDeg: 0 };

/** Where the player's throw controls start. */
export const PLAYER_START_LAUNCH: Launch = { speed: 6.5, pitchDeg: 2, yawDeg: 0, rollDeg: 0, aoaDeg: 0 };

/** The intro keeps throws gentle: above about 8 m/s a dart reaches the classroom ceiling. */
export const INTRO_MAX_SPEED = 12;

/** Throws remembered for the flight log. */
export const MAX_THROWS = 8;

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
  return makeDesign(preset, presetPaper(preset, { front: colorId }), { id: planeId, name: 'My first dart', author: author || undefined });
}

/* ------------------------------------------------------------------ progress */

export interface Progress {
  v: 1;
  /** Index into STEP_IDS. */
  step: number;
  /** Furthest step reached; the dots can jump back to anything up to here. */
  reached: number;
  /** Chosen paper colour id, null until picked. */
  color: string | null;
  /** Flat folds finished in the player's guided fold. */
  foldDone: number;
  /** Id the player's dart will be saved under. */
  planeId: string;
  /** The player's throws, oldest first. Flights are re-simulated from these (still air, fixed seed). */
  throws: Launch[];
  /** Name typed on the graduation screen, kept while the intro is unfinished. */
  name: string;
}

export const PROGRESS_KEY = 'ppl-onboarding';

export function freshProgress(planeId: string): Progress {
  return { v: 1, step: 0, reached: 0, color: null, foldDone: 0, planeId, throws: [], name: '' };
}

export function newPlaneId(): string {
  return `first-dart-${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => (isNum(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt);

function readLaunch(v: unknown): Launch | null {
  if (!isObj(v)) return null;
  const { speed, pitchDeg, yawDeg, rollDeg, aoaDeg } = v;
  if (!isNum(speed) || !isNum(pitchDeg) || !isNum(yawDeg) || !isNum(rollDeg) || !isNum(aoaDeg)) return null;
  return {
    speed: Math.max(THROW_LIMITS.minSpeed, Math.min(INTRO_MAX_SPEED, speed)),
    pitchDeg: Math.max(THROW_LIMITS.minPitchDeg, Math.min(60, pitchDeg)),
    yawDeg,
    rollDeg,
    aoaDeg,
  };
}

/** Whatever was stored, as a valid Progress (or a fresh one). */
export function sanitizeProgress(raw: unknown, planeId: string): Progress {
  const base = freshProgress(planeId);
  if (!isObj(raw) || raw.v !== 1) return base;
  const last = STEP_IDS.length - 1;
  const step = clampInt(raw.step, 0, last, 0);
  const color = typeof raw.color === 'string' && (PLAYER_COLORS as readonly string[]).includes(raw.color) ? raw.color : null;
  const throws = Array.isArray(raw.throws) ? raw.throws.map(readLaunch).filter((l): l is Launch => l !== null).slice(-MAX_THROWS) : [];
  return {
    v: 1,
    // Never resume past a step whose input is missing.
    step: step >= 3 && !color ? 3 : step,
    reached: Math.max(step, clampInt(raw.reached, 0, last, 0)),
    color,
    foldDone: clampInt(raw.foldDone, 0, 50, 0),
    planeId: typeof raw.planeId === 'string' && raw.planeId.length > 0 && raw.planeId.length < 80 ? raw.planeId : planeId,
    throws,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
  };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(): Progress {
  const id = newPlaneId();
  try {
    const text = storage()?.getItem(PROGRESS_KEY);
    return sanitizeProgress(text ? (JSON.parse(text) as unknown) : null, id);
  } catch {
    return freshProgress(id);
  }
}

export function saveProgress(p: Progress): void {
  try {
    storage()?.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Storage full or blocked: progress lives on in memory.
  }
}

export function clearProgress(): void {
  try {
    storage()?.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing to clear.
  }
}
