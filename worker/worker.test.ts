import { beforeAll, describe, expect, it } from 'vitest';
import { makeDesign, PRESETS, presetPaper } from '../src/core/designs';
import {
  API_PATH, buildTicketResult, ENGINE_VERSION, FallbackLeaderboard, HttpLeaderboard, LeaderboardError, LocalLeaderboard, scoreOf,
  toSubmitBody,
} from '../src/core/leaderboard';
import type { KeyValueStorage, SubmitEntry } from '../src/core/leaderboard';
import type { FlightTicket } from '../src/core/types';
import { createHandler } from './index';
import { MemoryRepo } from './repo';

const BASE = 'https://lab.example';

function ticket(speed = 9): FlightTicket {
  const p = PRESETS[0]!;
  return {
    design: makeDesign(p, presetPaper(p)),
    launch: { speed, pitchDeg: 5, yawDeg: 0, rollDeg: 0, aoaDeg: 0 },
    conditions: { envId: 'hangar' },
    seed: 3,
  };
}

let honest: FlightTicket;
let honestScore: number;
let hash: string;

beforeAll(() => {
  honest = ticket();
  const f = buildTicketResult(honest);
  honestScore = scoreOf('distance', f.result.metrics);
  hash = f.geometryHash;
});

function submitEntry(over: Partial<SubmitEntry> = {}): SubmitEntry {
  return {
    category: 'distance',
    arenaId: 'classic',
    player: 'Ada',
    planeName: 'My dart',
    designHash: 'client-claim',
    presetId: 'classic-dart',
    paperSizeId: 'a4',
    score: honestScore,
    ticket: honest,
    ...over,
  };
}

function setup(allowedOrigins: readonly string[] | '*' = '*') {
  const repo = new MemoryRepo();
  let n = 0;
  const handle = createHandler({
    repo,
    allowedOrigins,
    now: () => new Date(Date.UTC(2026, 10, 10, 12, 0, n)),
    newId: () => `id-${++n}`,
  });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    handle(new Request(`${BASE}${API_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
  const get = (qs: string) => handle(new Request(`${BASE}${API_PATH}?${qs}`));
  return { repo, handle, post, get };
}

describe('worker handler', () => {
  it('stores a verified flight with the server score and serves it', async () => {
    const { post, get, repo } = setup();
    const res = await post(toSubmitBody(submitEntry({ score: honestScore + 0.01 }), ENGINE_VERSION));
    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await res.json()) as { entry: { score: number; designHash: string; origin: string; id: string }; improved: boolean };
    expect(body.improved).toBe(true);
    expect(body.entry.score).toBe(honestScore);
    expect(body.entry.designHash).toBe(hash);
    expect(body.entry.origin).toBe('global');
    expect(repo.size).toBe(1);

    const again = await post(toSubmitBody(submitEntry({ player: ' ada ' }), ENGINE_VERSION));
    expect(again.status).toBe(200);
    expect(((await again.json()) as { improved: boolean }).improved).toBe(false);

    const top = await get('category=distance&arena=classic&limit=10');
    expect(top.status).toBe(200);
    const { entries } = (await top.json()) as { entries: { id: string }[] };
    expect(entries.map((e) => e.id)).toEqual([body.entry.id]);
    expect(((await (await get('category=airtime&arena=classic')).json()) as { entries: unknown[] }).entries).toEqual([]);
    expect(await repo.bestForPlayer('distance', 'classic', 'ADA')).not.toBeNull();
  });

  it('rejects tampered scores and illegal throws with 422', async () => {
    const { post, repo } = setup();
    const tampered = await post(toSubmitBody(submitEntry({ score: honestScore * 2 + 1 }), ENGINE_VERSION));
    expect(tampered.status).toBe(422);
    expect(((await tampered.json()) as { reasons: string[] }).reasons.join()).toMatch(/does not match/);
    const fast = await post(toSubmitBody(submitEntry({ ticket: ticket(14) }), ENGINE_VERSION));
    expect(fast.status).toBe(422);
    expect(((await fast.json()) as { reasons: string[] }).reasons.join()).toMatch(/throw speed/);
    const env = await post(toSubmitBody(submitEntry({ ticket: { ...honest, conditions: { envId: 'meadow' } } }), ENGINE_VERSION));
    expect(env.status).toBe(422);
    expect(repo.size).toBe(0);
  });

  it('rejects malformed input before simulating', async () => {
    const { post } = setup();
    expect((await post(toSubmitBody(submitEntry(), 'old-engine'))).status).toBe(409);
    expect((await post('{nope')).status).toBe(400);
    expect((await post(toSubmitBody(submitEntry(), ENGINE_VERSION), { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post(toSubmitBody(submitEntry({ player: '​ ' }), ENGINE_VERSION))).status).toBe(400);
    expect((await post(toSubmitBody(submitEntry({ arenaId: 'moon' }), ENGINE_VERSION))).status).toBe(400);
    const broken = { ...toSubmitBody(submitEntry(), ENGINE_VERSION), ticket: { ...honest, seed: 1.5, launch: { speed: 'x' } } };
    const res = await post(broken);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reasons: string[] }).reasons.length).toBeGreaterThan(1);
    const huge = JSON.stringify({ ...toSubmitBody(submitEntry(), ENGINE_VERSION), pad: 'x'.repeat(20_000) });
    expect((await post(huge)).status).toBe(413);
  });

  it('validates queries, paths and methods', async () => {
    const { get, handle } = setup();
    expect((await get('category=speed&arena=classic')).status).toBe(400);
    expect((await get('category=distance&arena=moon')).status).toBe(400);
    expect((await get('category=distance&arena=open&limit=0')).status).toBe(400);
    expect((await get('category=distance&arena=open&designHash=XYZ')).status).toBe(400);
    expect((await handle(new Request(`${BASE}/api/other`))).status).toBe(404);
    expect((await handle(new Request(`${BASE}${API_PATH}`, { method: 'DELETE' }))).status).toBe(405);
  });

  it('answers CORS preflight', async () => {
    const { handle } = setup(['https://app.example']);
    const pre = (origin: string) =>
      handle(new Request(`${BASE}${API_PATH}`, {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
      }));
    const ok = await pre('https://app.example');
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(ok.headers.get('access-control-allow-methods')).toContain('POST');
    expect(ok.headers.get('access-control-allow-headers')).toContain('content-type');
    expect((await pre('https://evil.example')).status).toBe(403);
  });
});

class MemStorage implements KeyValueStorage {
  private readonly m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

describe('HttpLeaderboard and FallbackLeaderboard against the handler', () => {
  it('submits and reads through HTTP; refusals surface as rejected errors', async () => {
    const { handle } = setup();
    const http = new HttpLeaderboard({ base: `${BASE}/`, fetch: (url, init) => handle(new Request(url, init)) });
    const stored = await http.submit(submitEntry());
    expect(stored.designHash).toBe(hash);
    expect((await http.top({ category: 'distance', arenaId: 'classic' })).map((e) => e.id)).toEqual([stored.id]);
    const err = await http.submit(submitEntry({ score: 999 })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LeaderboardError);
    expect((err as LeaderboardError).kind).toBe('rejected');
    expect((err as LeaderboardError).status).toBe(422);
  });

  it('times out, and the fallback store keeps working offline', async () => {
    const hang = () => new Promise<Response>(() => {});
    const http = new HttpLeaderboard({ base: BASE, fetch: hang, timeoutMs: 20 });
    const err = await http.top({ category: 'distance', arenaId: 'classic' }).catch((e: unknown) => e);
    expect((err as LeaderboardError).kind).toBe('timeout');

    const down = new HttpLeaderboard({ base: BASE, fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    const local = new LocalLeaderboard({ storage: new MemStorage() });
    const combined = new FallbackLeaderboard(down, local);
    const saved = await combined.submit(submitEntry());
    expect(saved.origin).toBe('local');
    expect(combined.lastError?.kind).toBe('network');
    expect((await combined.top({ category: 'distance', arenaId: 'classic' })).map((e) => e.id)).toEqual([saved.id]);
  });
});
