/**
 * Storage interface of the leaderboard API. Implementations: MemoryRepo (tests, `wrangler dev`),
 * D1Repo (worker/d1.ts, outline) and DynamoRepo (worker/dynamo.ts, outline).
 */
import { applyQuery, sortEntries } from '../src/core/leaderboard';
import type { RankCategory, RankEntry, RankQuery } from '../src/core/types';

export interface PutResult {
  /** True when the entry was stored (first flight of this plane by this player, or a better one). */
  stored: boolean;
  /** The player's best entry for this plane on this board after the put. */
  best: RankEntry;
}

export interface LeaderboardRepo {
  /** One board, best first, at most one entry per (player, designHash), at most `limit` (default 50, max 100). */
  top(query: RankQuery): Promise<RankEntry[]>;
  /** Keep the best entry per (board, player, designHash); a worse or equal score is not stored. */
  put(entry: RankEntry): Promise<PutResult>;
  /** The player's best entry on a board over all their planes, or null. Players compare case-insensitively. */
  bestForPlayer(category: RankCategory, arenaId: string, player: string): Promise<RankEntry | null>;
}

export const playerKey = (player: string): string => player.trim().toLowerCase();

const slotKey = (e: Pick<RankEntry, 'category' | 'arenaId' | 'player' | 'designHash'>): string =>
  `${e.category}|${e.arenaId}|${playerKey(e.player)}|${e.designHash}`;

/** In-memory repository. In a deployed Worker it lives per isolate and is lost on eviction: tests and dev only. */
export class MemoryRepo implements LeaderboardRepo {
  private readonly slots = new Map<string, RankEntry>();

  async top(query: RankQuery): Promise<RankEntry[]> {
    return applyQuery([...this.slots.values()], query);
  }

  async put(entry: RankEntry): Promise<PutResult> {
    const key = slotKey(entry);
    const prev = this.slots.get(key);
    if (prev && prev.score >= entry.score) return { stored: false, best: prev };
    this.slots.set(key, entry);
    return { stored: true, best: entry };
  }

  async bestForPlayer(category: RankCategory, arenaId: string, player: string): Promise<RankEntry | null> {
    const p = playerKey(player);
    const mine = [...this.slots.values()].filter((e) => e.category === category && e.arenaId === arenaId && playerKey(e.player) === p);
    return sortEntries(mine)[0] ?? null;
  }

  get size(): number {
    return this.slots.size;
  }
}
