/**
 * Paper Plane Lab leaderboard API: a Cloudflare Worker fetch handler, storage-agnostic.
 *
 *   GET  /api/leaderboard?category=distance|airtime&arena=<id>&limit=1..100&designHash=<16 hex>
 *        200 { entries: RankEntry[] }
 *   POST /api/leaderboard   body SubmitBody { engine, entry, ticket } (JSON, at most 16 KiB)
 *        201 { entry, improved: true }   stored with the server's own re-simulated score
 *        200 { entry, improved: false }  valid, but the player already has a better flight of this plane
 *        400 bad input, 409 engine version mismatch, 413 too large, 415 not JSON, 422 verification failed,
 *        403 bot check failed, 429 rate limited
 *   OPTIONS  CORS preflight
 *
 * NOT WIRED into wrangler.jsonc yet; see docs/DEPLOY.md. Needs no Cloudflare type packages: the few platform
 * types used are declared below.
 */
import {
  API_PATH, cleanName, ENGINE_VERSION, getArena, isRankCategory, MAX_BODY_BYTES, MAX_LIMIT, MAX_PLANE_NAME, MAX_PLAYER_NAME,
  parseTicket, verifyTicket,
} from '../src/core/leaderboard';
import type { ErrorResponse, SubmitResponse, TopResponse, VerifyResult } from '../src/core/leaderboard';
import type { Arena, FlightTicket, RankCategory, RankEntry, RankQuery } from '../src/core/types';
import { MemoryRepo } from './repo';
import type { LeaderboardRepo } from './repo';

/** The part of the Workers ExecutionContext this handler may use. */
export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** Worker bindings and vars. Only ALLOWED_ORIGINS is read today; storage bindings arrive with D1 / DynamoDB. */
export interface Env {
  /** Comma-separated origins allowed by CORS, or "*". Default "*". */
  ALLOWED_ORIGINS?: string;
}

export interface HandlerDeps {
  repo: LeaderboardRepo;
  /** Exact origins allowed by CORS, or '*' for any. */
  allowedOrigins?: readonly string[] | '*';
  now?: () => Date;
  newId?: () => string;
  /** Server-side re-simulation; injectable only so tests can count calls. */
  verify?: (ticket: FlightTicket, category: RankCategory, arena: Arena, claimed: number) => VerifyResult;
  /** Bot check (Turnstile) for a submission; false = 403. Not set = no check. */
  checkHuman?: (request: Request, token: string | null) => Promise<boolean>;
  /** Rate limiter (Workers Rate Limiting binding); false = 429. Not set = no limit. */
  allow?: (key: string) => Promise<boolean>;
}

const HASH_RE = /^[0-9a-f]{16}$/;
const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Json = TopResponse | SubmitResponse | ErrorResponse;

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly reasons: string[] = []) {
    super(message);
  }
}

function corsHeaders(request: Request, allowed: readonly string[] | '*'): Record<string, string> {
  const origin = request.headers.get('origin');
  const h: Record<string, string> = { vary: 'Origin' };
  if (allowed === '*') h['access-control-allow-origin'] = '*';
  else if (origin !== null && allowed.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}

function json(body: Json, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers },
  });
}

/** Read at most `max` bytes of the body; larger bodies are refused without reading the rest. */
async function readLimited(request: Request, max: number): Promise<string> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > max) throw new HttpError(413, 'body too large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(413, 'body too large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

function parseQuery(url: URL): RankQuery {
  const category = url.searchParams.get('category');
  if (!isRankCategory(category)) throw new HttpError(400, 'category must be distance or airtime');
  const arenaId = url.searchParams.get('arena') ?? '';
  if (!getArena(arenaId)) throw new HttpError(400, `unknown arena "${arenaId.slice(0, 32)}"`);
  const q: RankQuery = { category, arenaId };
  const limit = url.searchParams.get('limit');
  if (limit !== null) {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) throw new HttpError(400, `limit must be an integer 1 - ${MAX_LIMIT}`);
    q.limit = n;
  }
  const designHash = url.searchParams.get('designHash');
  if (designHash !== null) {
    if (!HASH_RE.test(designHash)) throw new HttpError(400, 'designHash must be 16 hex characters');
    q.designHash = designHash;
  }
  return q;
}

interface Submission {
  category: RankCategory;
  arena: Arena;
  player: string;
  planeName: string;
  presetId?: string;
  claimed: number;
  ticket: FlightTicket;
  turnstile: string | null;
}

function parseSubmission(raw: unknown): Submission {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new HttpError(400, 'body must be a JSON object');
  const body = raw as Record<string, unknown>;
  if (body.engine !== ENGINE_VERSION) {
    throw new HttpError(409, 'engine version mismatch: reload the app', [`server runs ${ENGINE_VERSION}`]);
  }
  const e = body.entry;
  if (typeof e !== 'object' || e === null || Array.isArray(e)) throw new HttpError(400, 'entry must be an object');
  const entry = e as Record<string, unknown>;
  const reasons: string[] = [];
  const category = entry.category;
  if (!isRankCategory(category)) reasons.push('entry.category must be distance or airtime');
  const arena = typeof entry.arenaId === 'string' ? getArena(entry.arenaId) : undefined;
  if (!arena) reasons.push('entry.arenaId is not a known arena');
  const player = cleanName(entry.player, MAX_PLAYER_NAME);
  if (player === null) reasons.push(`entry.player must be 1 - ${MAX_PLAYER_NAME} visible characters`);
  const planeName = cleanName(entry.planeName, MAX_PLANE_NAME);
  if (planeName === null) reasons.push(`entry.planeName must be 1 - ${MAX_PLANE_NAME} visible characters`);
  const claimed = entry.score;
  if (typeof claimed !== 'number' || !Number.isFinite(claimed) || claimed < 0) reasons.push('entry.score must be a number >= 0');
  const presetId = entry.presetId;
  if (presetId !== undefined && (typeof presetId !== 'string' || !PRESET_ID_RE.test(presetId))) reasons.push('entry.presetId is invalid');
  const turnstile = body.turnstile;
  if (turnstile !== undefined && (typeof turnstile !== 'string' || turnstile.length > 2048)) reasons.push('turnstile token is invalid');
  const ticket = parseTicket(body.ticket);
  if (!ticket.ok) reasons.push(...ticket.reasons);
  if (reasons.length > 0 || !ticket.ok || !arena || !isRankCategory(category) || player === null || planeName === null) {
    throw new HttpError(400, 'invalid submission', reasons.slice(0, 20));
  }
  return {
    category,
    arena,
    player,
    planeName,
    ...(typeof presetId === 'string' ? { presetId } : {}),
    claimed: claimed as number,
    ticket: ticket.value,
    turnstile: typeof turnstile === 'string' ? turnstile : null,
  };
}

/** Build the fetch handler around a repository. */
export function createHandler(deps: HandlerDeps): (request: Request) => Promise<Response> {
  const allowed = deps.allowedOrigins ?? '*';
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const verify = deps.verify ?? verifyTicket;

  async function submit(request: Request, cors: Record<string, string>): Promise<Response> {
    const type = request.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'content-type must be application/json');
    const text = await readLimited(request, MAX_BODY_BYTES);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'body is not valid JSON');
    }
    const sub = parseSubmission(raw);
    if (deps.allow && !(await deps.allow(`submit:${sub.player.toLowerCase()}`))) throw new HttpError(429, 'too many submissions, try again in a minute');
    if (deps.checkHuman && !(await deps.checkHuman(request, sub.turnstile))) throw new HttpError(403, 'bot check failed');

    const v = verify(sub.ticket, sub.category, sub.arena, sub.claimed);
    if (!v.ok || v.score === null || v.geometryHash === null) throw new HttpError(422, 'flight could not be verified', v.reasons);

    const entry: RankEntry = {
      id: newId(),
      category: sub.category,
      arenaId: sub.arena.id,
      player: sub.player,
      planeName: sub.planeName,
      designHash: v.geometryHash,
      ...(sub.presetId ? { presetId: sub.presetId } : {}),
      paperSizeId: sub.ticket.design.paper.sizeId,
      score: v.score,
      createdAt: now().toISOString(),
      origin: 'global',
      ticket: sub.ticket,
    };
    const put = await deps.repo.put(entry);
    return json({ entry: put.best, improved: put.stored }, put.stored ? 201 : 200, cors);
  }

  return async (request: Request): Promise<Response> => {
    const cors = corsHeaders(request, allowed);
    try {
      const url = new URL(request.url);
      if (url.pathname !== API_PATH) throw new HttpError(404, 'not found');
      switch (request.method) {
        case 'OPTIONS': {
          if (!cors['access-control-allow-origin']) throw new HttpError(403, 'origin not allowed');
          return new Response(null, {
            status: 204,
            headers: {
              ...cors,
              'access-control-allow-methods': 'GET, POST, OPTIONS',
              'access-control-allow-headers': 'content-type',
              'access-control-max-age': '86400',
            },
          });
        }
        case 'GET': {
          if (deps.allow && !(await deps.allow('read'))) throw new HttpError(429, 'too many requests');
          const entries = await deps.repo.top(parseQuery(url));
          return json({ entries }, 200, { ...cors, 'cache-control': 'public, max-age=15' });
        }
        case 'POST':
          return await submit(request, cors);
        default:
          return json({ error: 'method not allowed' }, 405, { ...cors, allow: 'GET, POST, OPTIONS' });
      }
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message, ...(err.reasons.length > 0 ? { reasons: err.reasons } : {}) }, err.status, cors);
      }
      return json({ error: 'internal error' }, 500, cors);
    }
  };
}

function parseOrigins(v: string | undefined): readonly string[] | '*' {
  const list = (v ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes('*') ? '*' : list;
}

/**
 * Default Worker export. Uses an in-memory repository per isolate until D1 or DynamoDB is hooked up
 * (docs/DEPLOY.md): entries vanish when the isolate is recycled, so do not route production traffic here yet.
 */
const repo = new MemoryRepo();
let cached: { origins: string | undefined; handle: (r: Request) => Promise<Response> } | null = null;

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContextLike): Promise<Response> {
    if (!cached || cached.origins !== env.ALLOWED_ORIGINS) {
      cached = { origins: env.ALLOWED_ORIGINS, handle: createHandler({ repo, allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS) }) };
    }
    return cached.handle(request);
  },
};
