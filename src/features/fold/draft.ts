/** The plane being worked on in the Fold tab: a local reducer with undo / redo, kept in sessionStorage. */
import type { PlaneDesign } from '../../core/types';

export type Stage = 'choose' | 'fold' | 'shape' | 'trim';
export const STAGES: readonly Stage[] = ['choose', 'fold', 'shape', 'trim'];
export type FoldMode = 'guided' | 'freeform';

export interface Draft {
  design: PlaneDesign;
  stage: Stage;
  mode: FoldMode;
  /** Guided mode: flat steps the player has completed. */
  guidedDone: number;
  /** Id of the saved plane this draft edits, or null for a new plane. */
  editingId: string | null;
  past: PlaneDesign[];
  future: PlaneDesign[];
  /** Key of the last edit: consecutive edits with the same key (one slider drag) share one undo entry. */
  lastKey: string | null;
}

export type DraftAction =
  | { type: 'start'; design: PlaneDesign; mode: FoldMode; stage: Stage; editingId?: string | null; guidedDone?: number }
  | { type: 'edit'; design: PlaneDesign; key?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'stage'; stage: Stage }
  | { type: 'mode'; mode: FoldMode }
  | { type: 'guided'; done: number }
  | { type: 'saved'; id: string }
  | { type: 'clear' };

export const HISTORY_LIMIT = 80;

export function reduceDraft(d: Draft | null, a: DraftAction): Draft | null {
  if (a.type === 'start') {
    return {
      design: a.design,
      stage: a.stage,
      mode: a.mode,
      guidedDone: a.guidedDone ?? 0,
      editingId: a.editingId ?? null,
      past: [],
      future: [],
      lastKey: null,
    };
  }
  if (a.type === 'clear') return null;
  if (!d) return d;
  switch (a.type) {
    case 'edit': {
      if (a.design === d.design) return d;
      const coalesce = a.key !== undefined && a.key === d.lastKey;
      return {
        ...d,
        design: a.design,
        past: coalesce ? d.past : [...d.past, d.design].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: a.key ?? null,
      };
    }
    case 'undo': {
      const prev = d.past[d.past.length - 1];
      if (!prev) return d;
      return { ...d, design: prev, past: d.past.slice(0, -1), future: [d.design, ...d.future], lastKey: null };
    }
    case 'redo': {
      const next = d.future[0];
      if (!next) return d;
      return { ...d, design: next, past: [...d.past, d.design], future: d.future.slice(1), lastKey: null };
    }
    case 'stage':
      return d.stage === a.stage ? d : { ...d, stage: a.stage, lastKey: null };
    case 'mode':
      return d.mode === a.mode ? d : { ...d, mode: a.mode, lastKey: null };
    case 'guided':
      return d.guidedDone === a.done ? d : { ...d, guidedDone: a.done };
    case 'saved':
      return { ...d, editingId: a.id, design: { ...d.design, id: a.id } };
  }
}

/* ------------------------------------------------------------------ persistence */

export const DRAFT_KEY = 'ppl-fold-draft';
/** History kept across reloads; the live session keeps HISTORY_LIMIT. */
const STORED_HISTORY = 30;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isDesign(v: unknown): v is PlaneDesign {
  return (
    isObject(v) &&
    v.v === 1 &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    isObject(v.paper) &&
    Array.isArray(v.steps) &&
    isObject(v.shape) &&
    isObject(v.trim)
  );
}

export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObject(v) || !isDesign(v.design)) return null;
    const stage = STAGES.includes(v.stage as Stage) ? (v.stage as Stage) : 'fold';
    const mode: FoldMode = v.mode === 'guided' ? 'guided' : 'freeform';
    const list = (x: unknown): PlaneDesign[] => (Array.isArray(x) ? x.filter(isDesign) : []);
    return {
      design: v.design,
      stage,
      mode,
      guidedDone: typeof v.guidedDone === 'number' && v.guidedDone >= 0 ? Math.floor(v.guidedDone) : 0,
      editingId: typeof v.editingId === 'string' ? v.editingId : null,
      past: list(v.past),
      future: list(v.future),
      lastKey: null,
    };
  } catch {
    return null;
  }
}

export function serializeDraft(d: Draft): string {
  return JSON.stringify({ ...d, past: d.past.slice(-STORED_HISTORY), future: d.future.slice(0, STORED_HISTORY), lastKey: null });
}

function session(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function loadDraft(): Draft | null {
  try {
    return parseDraft(session()?.getItem(DRAFT_KEY) ?? null);
  } catch {
    return null;
  }
}

export function storeDraft(d: Draft | null): void {
  try {
    const s = session();
    if (!s) return;
    if (d) s.setItem(DRAFT_KEY, serializeDraft(d));
    else s.removeItem(DRAFT_KEY);
  } catch {
    // Storage full or blocked: the draft lives on in memory.
  }
}

/* ------------------------------------------------------------------ naming */

/** A fresh id for a plane the player saves. */
export function newPlaneId(base: string): string {
  const stamp = Date.now().toString(36);
  const salt = Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0');
  return `${base}-${stamp}${salt}`;
}

/** "My design n": the first n not already taken. */
export function nextDesignName(names: readonly string[]): string {
  const taken = new Set(names);
  for (let n = 1; ; n++) {
    const name = `My design ${n}`;
    if (!taken.has(name)) return name;
  }
}
