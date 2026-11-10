import { parseTicket } from '../../core/leaderboard';
import type { FlightTicket } from '../../core/types';

/** History-state key under which "Watch replay" hands a ticket to /fly. */
export const REPLAY_STATE_KEY = 'replayTicket';

/** The ticket in the current history state, validated; null when there is none. For the Fly screen. */
export function readReplayTicket(state: unknown = typeof history !== 'undefined' ? history.state : null): FlightTicket | null {
  if (typeof state !== 'object' || state === null || !(REPLAY_STATE_KEY in state)) return null;
  const parsed = parseTicket((state as Record<string, unknown>)[REPLAY_STATE_KEY]);
  return parsed.ok ? parsed.value : null;
}
