/**
 * Onboarding progress: the steps and the resumable record kept in localStorage while the intro is
 * unfinished. No core imports, so the first screen stays light. Storage helpers never throw.
 */
import type { Launch } from '../../core/types';

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

/** Colours the player may pick for their first dart (PAPER_COLORS ids). Seven fit one row at 360 px. */
export const PLAYER_COLORS = ['white', 'butter', 'peach', 'coral', 'sky', 'mint', 'lilac'] as const;

/** The intro keeps throws gentle: above about 8 m/s a dart reaches the classroom ceiling. */
export const INTRO_MAX_SPEED = 12;

/** Throws remembered for the flight log. */
export const MAX_THROWS = 8;

/** Lowest throw speed and angle of the throw controls (THROW_LIMITS.minSpeed / minPitchDeg in core/sim). */
const MIN_SPEED = 2;
const MIN_PITCH_DEG = -20;

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
  return {
    v: 1,
    step: 0,
    reached: 0,
    color: null,
    foldDone: 0,
    planeId,
    throws: [],
    name: '',
  };
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
    speed: Math.max(MIN_SPEED, Math.min(INTRO_MAX_SPEED, speed)),
    pitchDeg: Math.max(MIN_PITCH_DEG, Math.min(60, pitchDeg)),
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
  const throws = Array.isArray(raw.throws)
    ? raw.throws
        .map(readLaunch)
        .filter((l): l is Launch => l !== null)
        .slice(-MAX_THROWS)
    : [];
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
