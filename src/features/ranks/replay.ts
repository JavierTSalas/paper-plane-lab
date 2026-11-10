import { HOUSE_PLAYER, parseTicket } from '../../core/leaderboard';
import type { FlightTicket, RankEntry } from '../../core/types';

/** History-state key under which "Watch replay" hands a ticket to /fly. */
export const REPLAY_STATE_KEY = 'replayTicket';
/** History-state key of the name shown with the replay ("Lab benchmark" or the pilot). */
export const REPLAY_PLAYER_KEY = 'replayPlayer';

/** A ranked flight to watch again on the Fly screen. */
export interface ReplayRequest {
  ticket: FlightTicket;
  /** Who flew it, as shown on the board. */
  player: string;
}

/** The navigation state that asks /fly to replay a board entry. */
export function replayState(entry: RankEntry): Record<string, unknown> {
  return { [REPLAY_STATE_KEY]: entry.ticket, [REPLAY_PLAYER_KEY]: entry.origin === 'house' ? HOUSE_PLAYER : entry.player };
}

/** The ticket in the current history state, validated; null when there is none. For the Fly screen. */
export function readReplayTicket(state: unknown = typeof history !== 'undefined' ? history.state : null): FlightTicket | null {
  if (typeof state !== 'object' || state === null || !(REPLAY_STATE_KEY in state)) return null;
  const parsed = parseTicket((state as Record<string, unknown>)[REPLAY_STATE_KEY]);
  return parsed.ok ? parsed.value : null;
}

/** The replay request in the current history state (ticket validated); null when there is none. */
export function readReplay(state: unknown = typeof history !== 'undefined' ? history.state : null): ReplayRequest | null {
  const ticket = readReplayTicket(state);
  if (!ticket) return null;
  const who = (state as Record<string, unknown>)[REPLAY_PLAYER_KEY];
  const player = typeof who === 'string' && who.trim().length > 0 ? who.trim().slice(0, 48) : 'A pilot';
  return { ticket, player };
}

/** Forget the replay request of the current history entry, so going "back to my plane" survives a reload. */
export function clearReplayState(): void {
  if (typeof history === 'undefined') return;
  const state: unknown = history.state;
  if (typeof state !== 'object' || state === null || !(REPLAY_STATE_KEY in state)) return;
  const { [REPLAY_STATE_KEY]: _ticket, [REPLAY_PLAYER_KEY]: _player, ...rest } = state as Record<string, unknown>;
  try {
    history.replaceState(Object.keys(rest).length > 0 ? rest : null, '');
  } catch {
    /* a locked-down history: the replay just shows again after a reload */
  }
}
