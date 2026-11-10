/**
 * OUTLINE - Cloudflare D1 (SQLite) adapter for LeaderboardRepo. Typed, NEVER run against D1 or tested here:
 * the SQL follows docs/research/08-platform-leaderboard.md section 2.5 (verified there against stock SQLite).
 * Hookup: `npx wrangler d1 create ppl`, add the `d1_databases` binding (DB), apply D1_SCHEMA as a migration,
 * then build the handler with `new D1Repo(env.DB)` (docs/DEPLOY.md).
 */
import { clampLimit, ENGINE_VERSION, scoreToInt } from '../src/core/leaderboard';
import type { RankCategory, RankEntry, RankQuery } from '../src/core/types';
import { playerKey } from './repo';
import type { LeaderboardRepo, PutResult } from './repo';

/** The few D1 types used, declared locally so no Cloudflare type package is needed. */
export interface D1Result<T> {
  results: T[];
  success: boolean;
  meta: { changes?: number };
}
export interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result<never>>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

/** One row per (board, player, design): the best flight. `score_int` is mm or ms; `doc` is the RankEntry JSON. */
export const D1_SCHEMA = `
CREATE TABLE IF NOT EXISTS best (
  board TEXT NOT NULL,
  player_key TEXT NOT NULL,
  design_hash TEXT NOT NULL,
  score_int INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  id TEXT NOT NULL,
  doc TEXT NOT NULL,
  PRIMARY KEY (board, player_key, design_hash)
);
CREATE INDEX IF NOT EXISTS best_rank ON best (board, score_int DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS best_player ON best (board, player_key, score_int DESC);
`;

export const d1Board = (category: RankCategory, arenaId: string): string => `${ENGINE_VERSION}|${category}|${arenaId}`;

const TOP_SQL = 'SELECT doc FROM best WHERE board = ?1 ORDER BY score_int DESC, created_at ASC LIMIT ?2';
const TOP_DESIGN_SQL = 'SELECT doc FROM best WHERE board = ?1 AND design_hash = ?3 ORDER BY score_int DESC, created_at ASC LIMIT ?2';
/** Insert, or overwrite only on a strictly better score (the WHERE on DO UPDATE). */
const UPSERT_SQL = `INSERT INTO best (board, player_key, design_hash, score_int, created_at, id, doc)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT (board, player_key, design_hash) DO UPDATE SET
  score_int = excluded.score_int, created_at = excluded.created_at, id = excluded.id, doc = excluded.doc
WHERE excluded.score_int > best.score_int`;
const ONE_SQL = 'SELECT doc FROM best WHERE board = ?1 AND player_key = ?2 AND design_hash = ?3';
const PLAYER_BEST_SQL = 'SELECT doc FROM best WHERE board = ?1 AND player_key = ?2 ORDER BY score_int DESC, created_at ASC LIMIT 1';

const parseDoc = (row: { doc?: unknown } | null): RankEntry | null => {
  if (!row || typeof row.doc !== 'string') return null;
  try {
    return JSON.parse(row.doc) as RankEntry;
  } catch {
    return null;
  }
};

/** OUTLINE: untested against D1. */
export class D1Repo implements LeaderboardRepo {
  constructor(private readonly db: D1Database) {}

  async top(q: RankQuery): Promise<RankEntry[]> {
    const board = d1Board(q.category, q.arenaId);
    const stmt = q.designHash
      ? this.db.prepare(TOP_DESIGN_SQL).bind(board, clampLimit(q.limit), q.designHash)
      : this.db.prepare(TOP_SQL).bind(board, clampLimit(q.limit));
    const { results } = await stmt.all<{ doc: string }>();
    return results.map(parseDoc).filter((e): e is RankEntry => e !== null);
  }

  async put(entry: RankEntry): Promise<PutResult> {
    const board = d1Board(entry.category, entry.arenaId);
    const pk = playerKey(entry.player);
    const res = await this.db
      .prepare(UPSERT_SQL)
      .bind(board, pk, entry.designHash, scoreToInt(entry.score), entry.createdAt, entry.id, JSON.stringify(entry))
      .run();
    if ((res.meta.changes ?? 0) > 0) return { stored: true, best: entry };
    const best = parseDoc(await this.db.prepare(ONE_SQL).bind(board, pk, entry.designHash).first<{ doc: string }>());
    return { stored: false, best: best ?? entry };
  }

  async bestForPlayer(category: RankCategory, arenaId: string, player: string): Promise<RankEntry | null> {
    return parseDoc(await this.db.prepare(PLAYER_BEST_SQL).bind(d1Board(category, arenaId), playerKey(player)).first<{ doc: string }>());
  }
}
