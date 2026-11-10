import { makeDesign, PRESETS, presetPaper } from '../../core/designs';
import {
  createLeaderboard,
  dedupeBest,
  FallbackLeaderboard,
  getArena,
  houseEntries,
  MAX_LIMIT,
  type KeyValueStorage,
} from '../../core/leaderboard';
import type { LeaderboardStore, RankCategory, RankEntry } from '../../core/types';
import type { HouseReply, HouseRequest } from './house.worker';

/** API origin from the build environment; empty when online rankings are not connected. */
export function apiBase(): string {
  const v: unknown = import.meta.env.VITE_LEADERBOARD_API;
  return typeof v === 'string' ? v.trim() : '';
}

export function isOnline(): boolean {
  return apiBase().length > 0;
}

function browserStorage(): KeyValueStorage {
  try {
    const ls = window.localStorage;
    ls.getItem('ppl-leaderboard');
    return ls;
  } catch {
    const map = new Map<string, string>();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
  }
}

let store: LeaderboardStore | null = null;

/**
 * The app's leaderboard: the player's flights on this device (plus the global board when an API is configured).
 * Lab benchmarks are NOT computed by the store here (that would block the main thread for seconds); they come
 * from a worker through `houseFor` and are merged by `loadBoard`.
 */
export function getLeaderboard(): LeaderboardStore {
  store ??= createLeaderboard({ apiBase: apiBase(), storage: browserStorage(), presets: [] });
  return store;
}

/** For tests: swap the store. */
export function setLeaderboard(s: LeaderboardStore | null): void {
  store = s;
}

/** True when the configured API could not be reached on the last call. */
export function lastCallOffline(): boolean {
  const s = getLeaderboard();
  return s instanceof FallbackLeaderboard && s.lastError !== null;
}

/* ------------------------------------------------------------------ lab benchmarks */

const house = new Map<string, Promise<RankEntry[]>>();
let worker: Worker | null | undefined;

function computeHere(arenaId: string): Promise<RankEntry[]> {
  return new Promise((resolve) => {
    // Yield first so a spinner can paint.
    setTimeout(() => {
      const arena = getArena(arenaId);
      resolve(arena ? houseEntries(PRESETS.map((p) => makeDesign(p, presetPaper(p))), [arena]) : []);
    }, 30);
  });
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./house.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

/** The lab's reference flights of every preset on one arena (both categories). Cached per session. */
export function houseFor(arenaId: string): Promise<RankEntry[]> {
  const hit = house.get(arenaId);
  if (hit) return hit;
  const w = getWorker();
  const p = w
    ? new Promise<RankEntry[]>((resolve) => {
        const onMessage = (e: MessageEvent<HouseReply>): void => {
          if (e.data.arenaId !== arenaId) return;
          w.removeEventListener('message', onMessage);
          resolve(e.data.entries);
        };
        const onError = (): void => {
          w.removeEventListener('error', onError);
          worker = null;
          resolve(computeHere(arenaId));
        };
        w.addEventListener('message', onMessage);
        w.addEventListener('error', onError);
        const req: HouseRequest = { arenaId };
        w.postMessage(req);
      })
    : computeHere(arenaId);
  house.set(arenaId, p);
  return p;
}

/** One board: the store's entries and the lab benchmarks, best per (player, design), best first. */
export async function loadBoard(category: RankCategory, arenaId: string): Promise<RankEntry[]> {
  const [own, ref] = await Promise.all([getLeaderboard().top({ category, arenaId, limit: MAX_LIMIT }), houseFor(arenaId)]);
  return dedupeBest([...own, ...ref.filter((e) => e.category === category)]).slice(0, MAX_LIMIT);
}
