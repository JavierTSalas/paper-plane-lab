import { hash32 } from '../math/rng';
import type { LeaderboardStore, PlaneDesign, RankEntry, RankQuery } from '../types';
import { API_PATH, toSubmitBody } from './api';
import type { SubmitEntry } from './api';
import { ENGINE_VERSION, getArena, isRankCategory } from './arenas';
import { houseEntries } from './house';
import { applyQuery, dedupeBest } from './rank';

/** The part of Web Storage the local store needs (localStorage fits; so does a Map wrapper in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const LOCAL_STORAGE_KEY = 'ppl-leaderboard';
/** Most entries kept on the device (after keeping only the best per player and plane). */
export const LOCAL_MAX_ENTRIES = 500;

interface LocalBlob {
  v: 1;
  entries: RankEntry[];
}

function looksLikeEntry(v: unknown): v is RankEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' && isRankCategory(e.category) && typeof e.arenaId === 'string' && typeof e.player === 'string' &&
    typeof e.planeName === 'string' && typeof e.designHash === 'string' && typeof e.score === 'number' &&
    Number.isFinite(e.score) && typeof e.createdAt === 'string' && typeof e.ticket === 'object' && e.ticket !== null
  );
}

export interface LocalLeaderboardOptions {
  storage: KeyValueStorage;
  /** Designs flown as "Lab benchmark" reference entries (usually every preset on its recommended sheet). */
  presets?: readonly PlaneDesign[];
  key?: string;
  now?: () => Date;
}

/**
 * The player's own ranked flights kept on the device (origin 'local'), merged with the lab's house reference
 * flights. Submissions are not re-simulated here: the client just flew them with the same code.
 */
export class LocalLeaderboard implements LeaderboardStore {
  private readonly storage: KeyValueStorage;
  private readonly presets: readonly PlaneDesign[];
  private readonly key: string;
  private readonly now: () => Date;
  private counter = 0;

  constructor(opts: LocalLeaderboardOptions) {
    this.storage = opts.storage;
    this.presets = opts.presets ?? [];
    this.key = opts.key ?? LOCAL_STORAGE_KEY;
    this.now = opts.now ?? (() => new Date());
  }

  /** The player's stored entries, unsorted. Corrupt storage reads as empty. */
  ownEntries(): RankEntry[] {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return [];
      const blob = JSON.parse(raw) as Partial<LocalBlob>;
      return Array.isArray(blob.entries) ? blob.entries.filter(looksLikeEntry) : [];
    } catch {
      return [];
    }
  }

  private save(entries: RankEntry[]): void {
    const blob: LocalBlob = { v: 1, entries: dedupeBest(entries).slice(0, LOCAL_MAX_ENTRIES) };
    try {
      this.storage.setItem(this.key, JSON.stringify(blob));
    } catch {
      // Storage full or blocked: the flight still counts for this session's caller, it just is not kept.
    }
  }

  async top(query: RankQuery): Promise<RankEntry[]> {
    const arena = getArena(query.arenaId);
    const house = arena ? houseEntries(this.presets, [arena]) : [];
    return applyQuery([...this.ownEntries(), ...house], query);
  }

  async submit(entry: SubmitEntry): Promise<RankEntry> {
    const createdAt = this.now().toISOString();
    const id = `local-${hash32(`${createdAt}|${entry.player}|${entry.designHash}|${entry.score}|${this.counter++}`).toString(16)}`;
    const stored: RankEntry = { ...entry, id, createdAt, origin: 'local' };
    this.save([...this.ownEntries(), stored]);
    return stored;
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                               */
/* ------------------------------------------------------------------ */

export type LeaderboardErrorKind = 'network' | 'timeout' | 'http' | 'rejected' | 'bad-response';

/**
 * network / timeout: the API could not be reached. http: a 5xx or unexpected status. rejected: a 4xx, the
 * flight or request was refused (`reasons` says why). bad-response: the reply was not the expected JSON.
 */
export class LeaderboardError extends Error {
  readonly kind: LeaderboardErrorKind;
  readonly status: number | null;
  readonly reasons: string[];

  constructor(kind: LeaderboardErrorKind, message: string, status: number | null = null, reasons: string[] = []) {
    super(message);
    this.name = 'LeaderboardError';
    this.kind = kind;
    this.status = status;
    this.reasons = reasons;
  }

  /** True when the server was unreachable or failed, so a local fallback makes sense. */
  get offline(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'http';
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpLeaderboardOptions {
  /** Origin (and optional path prefix) of the API, e.g. "https://lab.example.com". No trailing /api. */
  base: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export class HttpLeaderboard implements LeaderboardStore {
  private readonly base: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: HttpLeaderboardOptions) {
    this.base = opts.base.replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
    this.timeoutMs = opts.timeoutMs ?? 8000;
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const ctrl = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Race as well as abort: a fetch implementation that ignores the signal must not hang the caller.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
        reject(new Error('timeout'));
      }, this.timeoutMs);
    });
    let res: Response;
    try {
      res = await Promise.race([this.fetchImpl(url, { ...init, signal: ctrl.signal }), deadline]);
    } catch (err) {
      if (timedOut) throw new LeaderboardError('timeout', `leaderboard did not answer within ${this.timeoutMs} ms`);
      throw new LeaderboardError('network', `leaderboard unreachable: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const b = (body ?? {}) as { error?: unknown; reasons?: unknown };
      const message = typeof b.error === 'string' ? b.error : `HTTP ${res.status}`;
      const reasons = Array.isArray(b.reasons) ? b.reasons.filter((r): r is string => typeof r === 'string') : [];
      const kind = res.status >= 400 && res.status < 500 ? 'rejected' : 'http';
      throw new LeaderboardError(kind, message, res.status, reasons);
    }
    if (body === null) throw new LeaderboardError('bad-response', 'leaderboard replied without JSON', res.status);
    return body;
  }

  async top(query: RankQuery): Promise<RankEntry[]> {
    const params = new URLSearchParams({ category: query.category, arena: query.arenaId });
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.designHash !== undefined) params.set('designHash', query.designHash);
    const body = (await this.request(`${this.base}${API_PATH}?${params.toString()}`, { method: 'GET' })) as { entries?: unknown };
    if (!Array.isArray(body.entries)) throw new LeaderboardError('bad-response', 'leaderboard reply has no entries');
    return body.entries.filter(looksLikeEntry);
  }

  async submit(entry: SubmitEntry): Promise<RankEntry> {
    const body = (await this.request(`${this.base}${API_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toSubmitBody(entry, ENGINE_VERSION)),
    })) as { entry?: unknown };
    if (!looksLikeEntry(body.entry)) throw new LeaderboardError('bad-response', 'leaderboard reply has no entry');
    return body.entry;
  }
}

/* ------------------------------------------------------------------ */
/* Combined                                                           */
/* ------------------------------------------------------------------ */

/**
 * Global board with a local safety net. `top` merges the global entries with the house references and the
 * player's own local entries; when the API is unreachable it serves the local board alone. `submit` posts to
 * the API and keeps a local copy; if the API is unreachable the flight is kept locally only. A refusal
 * (a 4xx, e.g. failed verification) is thrown, never hidden.
 */
export class FallbackLeaderboard implements LeaderboardStore {
  /** The last network failure, or null after a successful call. For an "offline" badge. */
  lastError: LeaderboardError | null = null;

  constructor(readonly remote: LeaderboardStore, readonly local: LocalLeaderboard) {}

  private fail(err: unknown): LeaderboardError | null {
    if (err instanceof LeaderboardError && err.offline) {
      this.lastError = err;
      return err;
    }
    return null;
  }

  async top(query: RankQuery): Promise<RankEntry[]> {
    const localTop = await this.local.top({ ...query, limit: undefined });
    try {
      const remote = await this.remote.top(query);
      this.lastError = null;
      return applyQuery([...remote, ...localTop], query);
    } catch (err) {
      if (!this.fail(err)) throw err;
      return applyQuery(localTop, query);
    }
  }

  async submit(entry: SubmitEntry): Promise<RankEntry> {
    try {
      const stored = await this.remote.submit(entry);
      this.lastError = null;
      await this.local.submit({ ...entry, score: stored.score, designHash: stored.designHash });
      return stored;
    } catch (err) {
      if (!this.fail(err)) throw err;
      return this.local.submit(entry);
    }
  }
}

export interface CreateLeaderboardOptions {
  /** API origin; the caller reads it from import.meta.env.VITE_LEADERBOARD_API. Empty or undefined = offline. */
  apiBase?: string;
  storage: KeyValueStorage;
  presets: readonly PlaneDesign[];
  fetch?: FetchLike;
  timeoutMs?: number;
}

/** The global store with local fallback when an API is configured, otherwise the local store. */
export function createLeaderboard(opts: CreateLeaderboardOptions): LeaderboardStore {
  const local = new LocalLeaderboard({ storage: opts.storage, presets: opts.presets });
  const base = opts.apiBase?.trim();
  if (!base) return local;
  const remote = new HttpLeaderboard({
    base,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return new FallbackLeaderboard(remote, local);
}
