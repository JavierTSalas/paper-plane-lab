/** Wire format of /api/leaderboard, shared by HttpLeaderboard and worker/. */
import type { FlightTicket, RankCategory, RankEntry } from '../types';

export const API_PATH = '/api/leaderboard';
/** Request bodies above this are refused (doc 08 section 3.4: 16 KiB). */
export const MAX_BODY_BYTES = 16_384;
export const MAX_PLAYER_NAME = 32;
export const MAX_PLANE_NAME = 48;

export type SubmitEntry = Omit<RankEntry, 'id' | 'createdAt' | 'origin'>;

/** POST body. `designHash`, `paperSizeId` and `score` are recomputed by the server; `score` is the claim. */
export interface SubmitBody {
  engine: string;
  entry: {
    category: RankCategory;
    arenaId: string;
    player: string;
    planeName: string;
    score: number;
    designHash?: string;
    presetId?: string;
    paperSizeId?: string;
  };
  ticket: FlightTicket;
}

/** GET 200. */
export interface TopResponse {
  entries: RankEntry[];
}

/** POST 201 (stored, new best) or 200 (valid, but the player already has a better flight of this plane). */
export interface SubmitResponse {
  entry: RankEntry;
  improved: boolean;
}

/** Any 4xx / 5xx. */
export interface ErrorResponse {
  error: string;
  reasons?: string[];
}

export function toSubmitBody(entry: SubmitEntry, engine: string): SubmitBody {
  const { ticket, ...rest } = entry;
  return {
    engine,
    entry: {
      category: rest.category,
      arenaId: rest.arenaId,
      player: rest.player,
      planeName: rest.planeName,
      score: rest.score,
      designHash: rest.designHash,
      ...(rest.presetId ? { presetId: rest.presetId } : {}),
      paperSizeId: rest.paperSizeId,
    },
    ticket,
  };
}

/** Control characters, zero-width and bidi-override code points. */
function isInvisible(cp: number): boolean {
  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2028 && cp <= 0x202e) || cp === 0xfeff;
}

/** Collapse whitespace and strip control characters; empty after cleaning means invalid. */
export function cleanName(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = [...v.replace(/\s+/g, ' ')].filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0)).join('').trim();
  return s.length === 0 || s.length > max ? null : s;
}
