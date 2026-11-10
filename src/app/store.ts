import { useMemo } from 'react';
import { useStore } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { PaperSpec, PlaneDesign, ShapeSpec, TrimSpec } from '../core/types';
import type { FlightSummary, Profile, Settings } from './types';

/* ------------------------------------------------------------------ data */

export interface LabData {
  profile: Profile;
  /** The player's folded planes, by id. */
  planes: Record<string, PlaneDesign>;
  currentPlaneId: string | null;
  /** Newest first, capped at FLIGHT_CAP. */
  flights: FlightSummary[];
  settings: Settings;
  assignmentsDone: string[];
}

export interface LabActions {
  /** Insert or replace by id, and make it the current plane. */
  savePlane: (plane: PlaneDesign) => void;
  deletePlane: (id: string) => void;
  selectPlane: (id: string | null) => void;
  renamePlane: (id: string, name: string) => void;
  updateTrim: (id: string, trim: Partial<TrimSpec>) => void;
  updateShape: (id: string, shape: Partial<ShapeSpec>) => void;
  updatePaper: (id: string, paper: PaperSpec) => void;
  logFlight: (flight: FlightSummary) => void;
  /** Clears every flight, or only those of one plane. */
  clearFlights: (planeId?: string) => void;
  setName: (name: string) => void;
  /** Marks the intro done; optionally stores the player's name. */
  completeOnboarding: (name?: string) => void;
  resetOnboarding: () => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  markAssignment: (id: string) => void;
  /** Back to a first visit: planes, flights, profile and settings, plus the intro progress, the ranked flights kept on this device and the Fold and Fly drafts. */
  resetAll: () => void;
}

export type LabState = LabData & LabActions;

export const STORAGE_KEY = 'ppl-state';
export const STORE_VERSION = 1;
export const FLIGHT_CAP = 200;
const NAME_MAX = 40;

export const DEFAULT_SETTINGS: Settings = { units: 'metric', reducedMotion: false, showTrails: true };

export function initialData(): LabData {
  return {
    profile: { name: '', onboarded: false },
    planes: {},
    currentPlaneId: null,
    flights: [],
    settings: { ...DEFAULT_SETTINGS },
    assignmentsDone: [],
  };
}

/* ------------------------------------------------------------------ storage outside this store */

/**
 * Keys other parts of the app keep outside this store. "Reset progress" clears them too, so the lab is a
 * first visit again. The owners define the names (store.test.ts checks they agree):
 * the intro's resumable progress (features/onboarding/progress.ts: PROGRESS_KEY) and the ranked flights kept on
 * this device (core/leaderboard: LOCAL_STORAGE_KEY) in localStorage; the Fold tab's draft
 * (features/fold/draft.ts: DRAFT_KEY) and the Fly tab's place and camera (features/fly/flight.ts:
 * FLY_SESSION_KEY) in sessionStorage.
 */
export const SIDE_LOCAL_KEYS = ['ppl-onboarding', 'ppl-leaderboard'] as const;
export const SIDE_SESSION_KEYS = ['ppl-fold-draft', 'ppl-fly'] as const;

type Removable = Pick<Storage, 'removeItem'>;

function webStorage(kind: 'localStorage' | 'sessionStorage'): Removable | null {
  try {
    return typeof window !== 'undefined' ? window[kind] : null;
  } catch {
    return null;
  }
}

/** Remove everything the app stores outside the lab store. Blocked or missing storage is skipped. */
export function clearSideStorage(local: Removable | null = webStorage('localStorage'), session: Removable | null = webStorage('sessionStorage')): void {
  const drop = (storage: Removable | null, keys: readonly string[]): void => {
    for (const key of keys) {
      try {
        storage?.removeItem(key);
      } catch {
        // Blocked storage: nothing was kept there either.
      }
    }
  };
  drop(local, SIDE_LOCAL_KEYS);
  drop(session, SIDE_SESSION_KEYS);
}

/* ------------------------------------------------------------------ pure reducers */

const cleanName = (name: string): string => name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);

function patchPlane(d: LabData, id: string, patch: (p: PlaneDesign) => PlaneDesign): LabData {
  const plane = d.planes[id];
  return plane ? { ...d, planes: { ...d.planes, [id]: patch(plane) } } : d;
}

export const reduce = {
  savePlane: (d: LabData, plane: PlaneDesign): LabData => ({ ...d, planes: { ...d.planes, [plane.id]: plane }, currentPlaneId: plane.id }),

  deletePlane: (d: LabData, id: string): LabData => {
    if (!d.planes[id]) return d;
    const { [id]: _removed, ...planes } = d.planes;
    return { ...d, planes, currentPlaneId: d.currentPlaneId === id ? null : d.currentPlaneId };
  },

  selectPlane: (d: LabData, id: string | null): LabData => ({ ...d, currentPlaneId: id !== null && d.planes[id] ? id : null }),

  renamePlane: (d: LabData, id: string, name: string): LabData => {
    const clean = cleanName(name);
    return clean ? patchPlane(d, id, (p) => ({ ...p, name: clean })) : d;
  },

  updateTrim: (d: LabData, id: string, trim: Partial<TrimSpec>): LabData => patchPlane(d, id, (p) => ({ ...p, trim: { ...p.trim, ...trim } })),

  updateShape: (d: LabData, id: string, shape: Partial<ShapeSpec>): LabData => patchPlane(d, id, (p) => ({ ...p, shape: { ...p.shape, ...shape } })),

  updatePaper: (d: LabData, id: string, paper: PaperSpec): LabData => patchPlane(d, id, (p) => ({ ...p, paper })),

  logFlight: (d: LabData, flight: FlightSummary): LabData => ({
    ...d,
    flights: [flight, ...d.flights.filter((f) => f.id !== flight.id)].slice(0, FLIGHT_CAP),
  }),

  clearFlights: (d: LabData, planeId?: string): LabData => ({
    ...d,
    flights: planeId === undefined ? [] : d.flights.filter((f) => f.planeId !== planeId),
  }),

  setName: (d: LabData, name: string): LabData => ({ ...d, profile: { ...d.profile, name: cleanName(name) } }),

  completeOnboarding: (d: LabData, name?: string): LabData => ({
    ...d,
    profile: { name: name === undefined ? d.profile.name : cleanName(name), onboarded: true },
  }),

  resetOnboarding: (d: LabData): LabData => ({ ...d, profile: { ...d.profile, onboarded: false } }),

  setSetting: <K extends keyof Settings>(d: LabData, key: K, value: Settings[K]): LabData => ({ ...d, settings: { ...d.settings, [key]: value } }),

  markAssignment: (d: LabData, id: string): LabData => (d.assignmentsDone.includes(id) ? d : { ...d, assignmentsDone: [...d.assignmentsDone, id] }),
};

/* ------------------------------------------------------------------ persistence */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Coerce whatever is in storage into valid LabData, keeping every field that has the right shape. */
export function sanitize(raw: unknown): LabData {
  const base = initialData();
  if (!isObject(raw)) return base;
  const profile = isObject(raw.profile) ? raw.profile : {};
  const settings = isObject(raw.settings) ? raw.settings : {};
  const planes: Record<string, PlaneDesign> = {};
  if (isObject(raw.planes)) {
    for (const [id, p] of Object.entries(raw.planes)) {
      if (isObject(p) && p.v === 1 && typeof p.id === 'string') planes[id] = p as unknown as PlaneDesign;
    }
  }
  const current = typeof raw.currentPlaneId === 'string' && planes[raw.currentPlaneId] ? raw.currentPlaneId : null;
  return {
    profile: {
      name: typeof profile.name === 'string' ? profile.name : base.profile.name,
      onboarded: typeof profile.onboarded === 'boolean' ? profile.onboarded : base.profile.onboarded,
    },
    planes,
    currentPlaneId: current,
    flights: Array.isArray(raw.flights)
      ? (raw.flights.filter((f) => isObject(f) && typeof f.id === 'string' && typeof f.planeId === 'string') as unknown as FlightSummary[]).slice(0, FLIGHT_CAP)
      : [],
    settings: {
      units: settings.units === 'imperial' ? 'imperial' : 'metric',
      reducedMotion: typeof settings.reducedMotion === 'boolean' ? settings.reducedMotion : base.settings.reducedMotion,
      showTrails: typeof settings.showTrails === 'boolean' ? settings.showTrails : base.settings.showTrails,
    },
    assignmentsDone: Array.isArray(raw.assignmentsDone) ? raw.assignmentsDone.filter((a): a is string => typeof a === 'string') : [],
  };
}

/**
 * Upgrade stored data from an older version. Version 1 is the first release, so every older or unknown
 * version is salvaged field by field. Add a `version < N` step here when the shape changes.
 */
export function migrate(persisted: unknown, _version: number): LabData {
  return sanitize(persisted);
}

export function partialize(s: LabState): LabData {
  return {
    profile: s.profile,
    planes: s.planes,
    currentPlaneId: s.currentPlaneId,
    flights: s.flights,
    settings: s.settings,
    assignmentsDone: s.assignmentsDone,
  };
}

/** localStorage when it works; a throwaway in-memory map otherwise (private mode, blocked storage). */
function browserStorage(): StateStorage {
  try {
    const ls = window.localStorage;
    const probe = '__ppl_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryStorage();
  }
}

export function memoryStorage(): StateStorage & { dump: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map),
  };
}

export type LabStore = StoreApi<LabState>;

export function createLabStore(storage: StateStorage = browserStorage()): LabStore {
  return createStore<LabState>()(
    persist(
      (set) => {
        const apply = (fn: (d: LabData) => LabData): void => {
          set((s) => fn(s));
        };
        return {
          ...initialData(),
          savePlane: (plane) => apply((d) => reduce.savePlane(d, plane)),
          deletePlane: (id) => apply((d) => reduce.deletePlane(d, id)),
          selectPlane: (id) => apply((d) => reduce.selectPlane(d, id)),
          renamePlane: (id, name) => apply((d) => reduce.renamePlane(d, id, name)),
          updateTrim: (id, trim) => apply((d) => reduce.updateTrim(d, id, trim)),
          updateShape: (id, shape) => apply((d) => reduce.updateShape(d, id, shape)),
          updatePaper: (id, paper) => apply((d) => reduce.updatePaper(d, id, paper)),
          logFlight: (flight) => apply((d) => reduce.logFlight(d, flight)),
          clearFlights: (planeId) => apply((d) => reduce.clearFlights(d, planeId)),
          setName: (name) => apply((d) => reduce.setName(d, name)),
          completeOnboarding: (name) => apply((d) => reduce.completeOnboarding(d, name)),
          resetOnboarding: () => apply(reduce.resetOnboarding),
          setSetting: (key, value) => apply((d) => reduce.setSetting(d, key, value)),
          markAssignment: (id) => apply((d) => reduce.markAssignment(d, id)),
          resetAll: () => {
            apply(initialData);
            clearSideStorage();
          },
        };
      },
      {
        name: STORAGE_KEY,
        version: STORE_VERSION,
        storage: createJSONStorage<LabData>(() => storage),
        partialize,
        migrate,
        merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
      },
    ),
  );
}

/* ------------------------------------------------------------------ app instance and selectors */

export const labStore: LabStore = createLabStore();

/** `const units = useLab((s) => s.settings.units)`. Return primitives or stored references, not new objects. */
export function useLab<T>(selector: (s: LabState) => T): T {
  return useStore(labStore, selector);
}

export const selectCurrentPlane = (s: LabData): PlaneDesign | null => (s.currentPlaneId ? (s.planes[s.currentPlaneId] ?? null) : null);

/** Planes sorted by name, for a stable list. */
export function planeList(planes: Record<string, PlaneDesign>): PlaneDesign[] {
  return Object.values(planes).sort((a, b) => a.name.localeCompare(b.name));
}

export type BestMetric = 'distance' | 'airtime';

/** The best flight of each plane by the given metric. */
export function bestFlightsByPlane(flights: readonly FlightSummary[], metric: BestMetric = 'distance'): Record<string, FlightSummary> {
  const best: Record<string, FlightSummary> = {};
  for (const f of flights) {
    const prev = best[f.planeId];
    if (!prev || f.metrics[metric] > prev.metrics[metric]) best[f.planeId] = f;
  }
  return best;
}

export function useCurrentPlane(): PlaneDesign | null {
  return useLab(selectCurrentPlane);
}

export function useBestFlights(metric: BestMetric = 'distance'): Record<string, FlightSummary> {
  const flights = useLab((s) => s.flights);
  return useMemo(() => bestFlightsByPlane(flights, metric), [flights, metric]);
}
