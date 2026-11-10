/**
 * The Fly screen's side of ranked flights: the ticket of a throw, the boards it may enter, and plain words for
 * why an arena refuses it. Eligibility is decided by the leaderboard's own rule check (`checkTicketRules`), the
 * same one the server runs. Pure: no DOM.
 */
import { ARENAS, checkTicketRules, RANK_CATEGORIES, RANK_LIMITS, scoreOf } from '../../core/leaderboard';
import type { Arena, Conditions, FlightMetrics, FlightTicket, Launch, PlaneDesign, RankCategory } from '../../core/types';
import { formatSpeed, type UnitSystem } from '../../ui/format';

/** Everything needed to replay and verify one throw. */
export function ticketOf(throwRecord: { build: { design: PlaneDesign }; launch: Launch; conditions: Conditions; seed: number }): FlightTicket {
  return { design: throwRecord.build.design, launch: throwRecord.launch, conditions: throwRecord.conditions, seed: throwRecord.seed };
}

/** One board a throw may enter, with the score it would get there. */
export interface BoardOption {
  arena: Arena;
  category: RankCategory;
  /** Metres or seconds, as `scoreOf` rounds it. */
  score: number;
}

/** An arena in the throw's place that does not take it, with the reasons in plain words. */
export interface ArenaRefusal {
  arena: Arena;
  reasons: string[];
}

export interface RankingCheck {
  /** The throw was made where at least one arena flies (so a refusal is worth explaining). */
  inArenaPlace: boolean;
  boards: BoardOption[];
  refused: ArenaRefusal[];
}

export const CATEGORY_LABEL: Record<RankCategory, string> = { distance: 'Distance', airtime: 'Airtime' };

/** "Open Hangar · Distance". */
export const boardLabel = (b: { arena: Arena; category: RankCategory }): string => `${b.arena.name} · ${CATEGORY_LABEL[b.category]}`;

const sentence = (s: string): string => {
  const t = s.trim();
  if (t.length === 0) return t;
  const cap = t[0]!.toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
};

/**
 * A rule or verification reason from the leaderboard (terse, written for logs) in the Professor's plain words.
 * Unknown reasons are passed through as a sentence.
 */
export function plainReason(reason: string, ticket: FlightTicket, arena: Arena | undefined, units: UnitSystem = 'metric'): string {
  const r = reason.trim();
  if (/^paper clips/.test(r)) return 'It carries a paper clip. Ranked flights are paper only: take the clip off in Trim.';
  if (/^throw speed/.test(r)) {
    if (arena && ticket.launch.speed > arena.maxThrowSpeed) {
      return `The throw was faster than the ${arena.name} allows (${formatSpeed(ticket.launch.speed, units)}, the cap is ${formatSpeed(arena.maxThrowSpeed, units)}).`;
    }
    return `The throw was slower than a real throw (at least ${formatSpeed(RANK_LIMITS.minSpeed, units)}).`;
  }
  if (/^conditions differ/.test(r)) return 'The wind settings are not the arena’s fixed conditions.';
  if (/^this arena flies in/.test(r)) return 'The throw was not made in this arena’s place.';
  if (/^throw angle/.test(r)) return 'The throw angle is outside the range of a ranked throw.';
  if (/^release bank/.test(r)) return `The bank at release is more than ${RANK_LIMITS.maxRollDeg} degrees.`;
  if (/^heading/.test(r)) return `The aim is more than ${RANK_LIMITS.maxYawDeg} degrees off the measuring tape.`;
  if (/^release angle of attack/.test(r)) return 'The nose angle at release is outside the range of a ranked throw.';
  if (/^unknown paper size/.test(r) || /^the sheet is not a whole/.test(r)) return 'The sheet is not a whole standard sheet.';
  if (/^too many fold steps/.test(r)) return `The design has more than ${RANK_LIMITS.maxSteps} fold steps.`;
  if (/^ticket too large/.test(r)) return 'The design is too large to enter.';
  if (/^elevator (trim|bend)/.test(r)) return 'The elevator is bent further than a ranked flight allows. Ease it in Trim.';
  if (/^aileron trim/.test(r)) return 'The ailerons are bent further than a ranked flight allows. Ease them in Trim.';
  if (/^rudder trim/.test(r)) return 'The rudder is bent further than a ranked flight allows. Ease it in Trim.';
  if (/^(keel spread|dihedral|winglet angle)/.test(r)) return 'The shape of the plane is outside what a ranked flight allows.';
  if (/^the design does not fold cleanly/.test(r)) return 'The design does not fold cleanly, so the lab cannot re-fly it.';
  if (/^claimed score/.test(r)) return 'The lab re-flew the throw and got a different result, so it cannot be entered.';
  if (/^unknown arena/.test(r)) return 'That arena does not exist.';
  if (/unreachable|did not answer|HTTP \d+/.test(r)) return 'The online rankings could not be reached.';
  return sentence(r);
}

/**
 * Which boards a landed throw may enter. Each arena in the throw's place is checked with the leaderboard's
 * rules; an arena that passes offers both of its categories.
 */
export function checkRanking(ticket: FlightTicket, metrics: FlightMetrics, units: UnitSystem = 'metric', arenas: readonly Arena[] = ARENAS): RankingCheck {
  const here = arenas.filter((a) => a.envId === ticket.conditions.envId);
  const boards: BoardOption[] = [];
  const refused: ArenaRefusal[] = [];
  for (const arena of here) {
    // The rules do not depend on the category; check once per arena.
    const reasons = checkTicketRules(ticket, 'distance', arena);
    if (reasons.length === 0) {
      for (const category of RANK_CATEGORIES) boards.push({ arena, category, score: scoreOf(category, metrics) });
    } else {
      refused.push({ arena, reasons: [...new Set(reasons.map((r) => plainReason(r, ticket, arena, units)))] });
    }
  }
  return { inArenaPlace: here.length > 0, boards, refused };
}

/** The names of the arenas among the boards, each once, in order. */
export function arenaNames(boards: readonly BoardOption[]): string[] {
  return [...new Set(boards.map((b) => b.arena.name))];
}

/**
 * One line for the result card when a throw in an arena's place cannot be ranked at all: the reasons every
 * arena shares if there are any (a paper clip), else those of the most permissive arena.
 */
export function refusalSummary(check: RankingCheck): string | null {
  if (check.boards.length > 0 || check.refused.length === 0) return null;
  const [first, ...rest] = check.refused;
  const shared = first!.reasons.filter((r) => rest.every((o) => o.reasons.includes(r)));
  const widest = check.refused.reduce((a, b) => (b.arena.maxThrowSpeed > a.arena.maxThrowSpeed ? b : a));
  return (shared.length > 0 ? shared : widest.reasons).join(' ');
}
