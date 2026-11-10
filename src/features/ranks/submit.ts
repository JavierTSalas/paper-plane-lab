import { buildTicketResult, cleanName, getArena, LeaderboardError, MAX_PLANE_NAME, MAX_PLAYER_NAME, scoreOf, verifyTicket } from '../../core/leaderboard';
import type { FlightTicket, LeaderboardStore, RankCategory, RankEntry } from '../../core/types';
import { labStore } from '../../app/store';
import { getLeaderboard, houseFor } from './leaderboard';

export type SubmitOutcome =
  | {
      ok: true;
      entry: RankEntry;
      /** Lab benchmarks on this board the flight beat (plane names). */
      beatBenchmarks: string[];
    }
  | { ok: false; reasons: string[] };

export interface SubmitDeps {
  store: LeaderboardStore;
  house: (arenaId: string) => Promise<RankEntry[]>;
  markAssignment: (id: string) => void;
}

const defaultDeps = (): SubmitDeps => ({
  store: getLeaderboard(),
  house: houseFor,
  markAssignment: (id) => labStore.getState().markAssignment(id),
});

/**
 * Enter a flight in a ranking. Verifies the ticket locally with the same code the server runs (rules, then a
 * full re-simulation), then submits the re-simulated score. `claimedScore` is what the player saw; when it
 * is omitted the flight is simulated once to get it. Marks the "enter a ranking" and "beat a lab benchmark"
 * assignments. Never throws for a refused flight: the reasons come back in plain words.
 */
export async function submitFlight(
  ticket: FlightTicket,
  category: RankCategory,
  arenaId: string,
  player: string,
  claimedScore?: number,
  deps: SubmitDeps = defaultDeps(),
): Promise<SubmitOutcome> {
  const arena = getArena(arenaId);
  if (!arena) return { ok: false, reasons: [`unknown arena "${arenaId}"`] };
  const name = cleanName(player, MAX_PLAYER_NAME) ?? 'Pilot';
  const planeName = cleanName(ticket.design.name, MAX_PLANE_NAME) ?? 'Paper plane';

  const claim = claimedScore ?? scoreOf(category, buildTicketResult(ticket).result.metrics);
  const check = verifyTicket(ticket, category, arena, claim);
  if (!check.ok || check.score === null || check.geometryHash === null) return { ok: false, reasons: check.reasons };

  let entry: RankEntry;
  try {
    entry = await deps.store.submit({
      category,
      arenaId,
      player: name,
      planeName,
      designHash: check.geometryHash,
      ...(ticket.design.presetId ? { presetId: ticket.design.presetId } : {}),
      paperSizeId: ticket.design.paper.sizeId,
      score: check.score,
      ticket: { ...ticket, design: { ...ticket.design, name: planeName } },
    });
  } catch (err) {
    if (err instanceof LeaderboardError) return { ok: false, reasons: err.reasons.length > 0 ? err.reasons : [err.message] };
    throw err;
  }

  deps.markAssignment('enter-ranking');
  const house = await deps.house(arenaId);
  const beaten = house.filter((h) => h.category === category && entry.score > h.score).map((h) => h.planeName);
  if (beaten.length > 0) deps.markAssignment('beat-benchmark');
  return { ok: true, entry, beatBenchmarks: beaten };
}
