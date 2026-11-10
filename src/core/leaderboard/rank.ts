import type { RankEntry, RankQuery } from '../types';
import { compareEntries } from './score';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

/** Best first; ties go to the earlier entry, then by id so the order is total. */
export function sortEntries(entries: readonly RankEntry[]): RankEntry[] {
  return [...entries].sort((a, b) => compareEntries(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** One entry per (board, player, designHash): the best. Players are compared case-insensitively. */
export function dedupeBest(entries: readonly RankEntry[]): RankEntry[] {
  const best = new Map<string, RankEntry>();
  for (const e of sortEntries(entries)) {
    const key = `${e.category}|${e.arenaId}|${e.player.trim().toLowerCase()}|${e.designHash}`;
    if (!best.has(key)) best.set(key, e);
  }
  return sortEntries([...best.values()]);
}

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

/** Filter to one board (and design), de-duplicate, sort, limit. */
export function applyQuery(entries: readonly RankEntry[], q: RankQuery): RankEntry[] {
  const onBoard = entries.filter(
    (e) => e.category === q.category && e.arenaId === q.arenaId && (q.designHash === undefined || e.designHash === q.designHash),
  );
  return dedupeBest(onBoard).slice(0, clampLimit(q.limit));
}

export interface DesignGroup {
  designHash: string;
  /** Name of the best entry's plane. */
  planeName: string;
  presetId?: string;
  best: RankEntry;
  /** Best first. */
  entries: RankEntry[];
  /** Distinct players who flew this exact airplane. */
  pilots: number;
}

/** "The same airplane flown by N pilots": entries sharing a designHash, groups ordered by their best entry. */
export function groupByDesign(entries: readonly RankEntry[]): DesignGroup[] {
  const groups = new Map<string, RankEntry[]>();
  for (const e of sortEntries(entries)) {
    const list = groups.get(e.designHash);
    if (list) list.push(e);
    else groups.set(e.designHash, [e]);
  }
  return [...groups.entries()].map(([designHash, list]) => {
    const best = list[0]!;
    return {
      designHash,
      planeName: best.planeName,
      ...(best.presetId ? { presetId: best.presetId } : {}),
      best,
      entries: list,
      pilots: new Set(list.map((e) => e.player.trim().toLowerCase())).size,
    };
  });
}
