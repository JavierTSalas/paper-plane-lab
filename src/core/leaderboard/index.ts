/**
 * Leaderboard: arenas, scoring, server-authoritative ticket verification, local / HTTP stores.
 * Pure TypeScript: the same verifyTicket runs in the browser and in worker/.
 * See docs/ARCHITECTURE.md section 8 and docs/research/08-platform-leaderboard.md.
 */
export { ARENAS, boardKey, boards, ENGINE_VERSION, getArena, HOUSE_PLAYER, isRankCategory, RANK_CATEGORIES } from './arenas';
export { compareEntries, formatScore, SCORE_TOLERANCE, scoreOf, scoresMatch, scoreToInt } from './score';
export { buildTicketResult, checkTicketRules, RANK_LIMITS, verifyTicket } from './verify';
export type { TicketFlight, VerifyResult } from './verify';
export { parseTicket } from './parse';
export type { Parsed } from './parse';
export { clearHouseCache, HOUSE_CREATED_AT, HOUSE_SEED, houseEntries } from './house';
export { applyQuery, clampLimit, dedupeBest, DEFAULT_LIMIT, groupByDesign, MAX_LIMIT, sortEntries } from './rank';
export type { DesignGroup } from './rank';
export { API_PATH, cleanName, MAX_BODY_BYTES, MAX_PLANE_NAME, MAX_PLAYER_NAME, toSubmitBody } from './api';
export type { ErrorResponse, SubmitBody, SubmitEntry, SubmitResponse, TopResponse } from './api';
export {
  createLeaderboard, FallbackLeaderboard, HttpLeaderboard, LeaderboardError, LOCAL_MAX_ENTRIES, LOCAL_STORAGE_KEY, LocalLeaderboard,
} from './stores';
export type {
  CreateLeaderboardOptions, FetchLike, HttpLeaderboardOptions, KeyValueStorage, LeaderboardErrorKind, LocalLeaderboardOptions,
} from './stores';
