import { buildAirframe } from '../airframe';
import { ENVIRONMENTS, getEnvironment } from '../env';
import { buildPlane } from '../fold';
import { PAPER_SIZES } from '../paper';
import { simulateFlight, THROW_LIMITS } from '../sim';
import { geometryHash } from '../similarity';
import type { Arena, Conditions, FlightResult, FlightTicket, FoldIssue, RankCategory } from '../types';
import { isRankCategory } from './arenas';
import { scoreOf, scoresMatch } from './score';

/** Rules of every ranked flight on top of the arena's own conditions and speed cap. */
export const RANK_LIMITS = {
  /** A real throw: at least the slowest throw the controls offer, m/s. */
  minSpeed: THROW_LIMITS.minSpeed,
  minPitchDeg: THROW_LIMITS.minPitchDeg,
  maxPitchDeg: THROW_LIMITS.maxPitchDeg,
  maxRollDeg: THROW_LIMITS.maxRollDeg,
  /** Heading either way of the throw line, degrees (design choice: the hangar is long, not wide). */
  maxYawDeg: 45,
  /** Angle of attack at release either way, degrees (design choice). */
  maxAoaDeg: 30,
  /** Fold steps of one design (doc 08 section 3.4: 64 folds fit in about 4 KB). */
  maxSteps: 64,
  /** Serialised ticket, bytes (UTF-16 code units of the JSON, a close upper bound for ASCII). */
  maxTicketBytes: 12_288,
  /** Trim a hand can put into paper, degrees; a little wider than the trim controls. */
  elevatorDeg: [-15, 30] as const,
  elevatorChordFrac: [0.05, 0.35] as const,
  aileronDeg: [-15, 15] as const,
  rudderDeg: [-20, 20] as const,
  keelSpreadDeg: [0, 180] as const,
  dihedralDeg: [-45, 60] as const,
  wingletDeg: [-120, 120] as const,
  /** Sheet dimensions must match a known size to this many metres (0.01 mm). */
  paperTolerance: 1e-5,
} as const;

export interface TicketFlight {
  result: FlightResult;
  geometryHash: string;
  issues: FoldIssue[];
}

/** Fold the design, build the airframe and fly the ticket again, exactly as the client did. */
export function buildTicketResult(ticket: FlightTicket): TicketFlight {
  const { model, issues } = buildPlane(ticket.design);
  const airframe = buildAirframe(model, ticket.design.trim);
  const env = getEnvironment(ticket.conditions.envId);
  const result = simulateFlight(airframe, ticket.launch, env, ticket.conditions, ticket.seed);
  return { result, geometryHash: geometryHash(model), issues };
}

export interface VerifyResult {
  ok: boolean;
  /** The server's own score; null when a rule check failed before re-simulating. */
  score: number | null;
  reasons: string[];
  geometryHash: string | null;
}

const inRange = (v: number, [lo, hi]: readonly [number, number]): boolean => v >= lo && v <= hi;

function sameConditions(a: Conditions, b: Conditions): boolean {
  return a.envId === b.envId && a.windSpeed === b.windSpeed && a.windTowardDeg === b.windTowardDeg && a.gustiness === b.gustiness;
}

/** Arena and rank rules that need no simulation. Returns the reasons a ticket breaks them. */
export function checkTicketRules(ticket: FlightTicket, category: RankCategory, arena: Arena): string[] {
  const reasons: string[] = [];
  const L = RANK_LIMITS;
  if (!isRankCategory(category)) reasons.push(`unknown category "${String(category)}"`);

  if (ticket.conditions.envId !== arena.envId || !ENVIRONMENTS.some((e) => e.id === ticket.conditions.envId)) {
    reasons.push(`this arena flies in "${arena.envId}", not "${ticket.conditions.envId}"`);
  } else if (!sameConditions(ticket.conditions, arena.conditions)) {
    reasons.push('conditions differ from the arena\'s fixed conditions');
  }

  const { speed, pitchDeg, rollDeg, yawDeg, aoaDeg } = ticket.launch;
  if (!(speed >= L.minSpeed && speed <= arena.maxThrowSpeed)) {
    reasons.push(`throw speed ${speed.toFixed(2)} m/s is outside ${L.minSpeed} - ${arena.maxThrowSpeed} m/s`);
  }
  if (!inRange(pitchDeg, [L.minPitchDeg, L.maxPitchDeg])) reasons.push(`throw angle ${pitchDeg} deg is out of range`);
  if (!(Math.abs(rollDeg) <= L.maxRollDeg)) reasons.push(`release bank ${rollDeg} deg is out of range`);
  if (!(Math.abs(yawDeg) <= L.maxYawDeg)) reasons.push(`heading ${yawDeg} deg is out of range`);
  if (!(Math.abs(aoaDeg) <= L.maxAoaDeg)) reasons.push(`release angle of attack ${aoaDeg} deg is out of range`);

  if (!Number.isInteger(ticket.seed) || ticket.seed < 0 || ticket.seed > 0xffffffff) reasons.push('seed must be a 32-bit integer');

  const { design } = ticket;
  const size = PAPER_SIZES.find((s) => s.id === design.paper.sizeId);
  const tol = L.paperTolerance;
  const fits = (w: number, h: number): boolean => Math.abs(design.paper.width - w) <= tol && Math.abs(design.paper.height - h) <= tol;
  if (!size) reasons.push(`unknown paper size "${design.paper.sizeId}"`);
  else if (!fits(size.short, size.long) && !fits(size.long, size.short)) reasons.push(`the sheet is not a whole ${size.name} sheet`);

  if (design.steps.length > L.maxSteps) reasons.push(`too many fold steps (${design.steps.length} > ${L.maxSteps})`);
  const bytes = JSON.stringify(ticket).length;
  if (bytes > L.maxTicketBytes) reasons.push(`ticket too large (${bytes} > ${L.maxTicketBytes} bytes)`);

  const { trim, shape } = design;
  if (trim.clip !== null) reasons.push('paper clips are not allowed in ranked flights (paper only)');
  if (!inRange(trim.elevatorDeg, L.elevatorDeg)) reasons.push('elevator trim out of range');
  if (!inRange(trim.elevatorChordFrac, L.elevatorChordFrac)) reasons.push('elevator bend depth out of range');
  if (!inRange(trim.aileronDeg, L.aileronDeg)) reasons.push('aileron trim out of range');
  if (!inRange(trim.rudderDeg, L.rudderDeg)) reasons.push('rudder trim out of range');
  if (!inRange(shape.keelSpreadDeg, L.keelSpreadDeg)) reasons.push('keel spread out of range');
  if (!inRange(shape.dihedralDeg, L.dihedralDeg)) reasons.push('dihedral out of range');
  if (!inRange(shape.wingletDeg, L.wingletDeg)) reasons.push('winglet angle out of range');
  return reasons;
}

/**
 * Server-authoritative check of a ranked flight: rules first, then a full re-simulation. The claimed score
 * must match the re-simulated one within 0.5 % or 2 cm / 20 ms (whichever is larger). `score` is the
 * re-simulated score; store that one, never the claim.
 */
export function verifyTicket(ticket: FlightTicket, category: RankCategory, arena: Arena, claimedScore: number): VerifyResult {
  const reasons = checkTicketRules(ticket, category, arena);
  if (reasons.length > 0) return { ok: false, score: null, reasons, geometryHash: null };

  const flight = buildTicketResult(ticket);
  const foldErrors = flight.issues.filter((i) => i.severity === 'error');
  if (foldErrors.length > 0) reasons.push(`the design does not fold cleanly: ${foldErrors[0]!.message}`);
  const score = scoreOf(category, flight.result.metrics);
  if (!scoresMatch(category, claimedScore, score)) {
    reasons.push(`claimed score ${claimedScore} does not match the re-simulated ${score}`);
  }
  return { ok: reasons.length === 0, score, reasons, geometryHash: flight.geometryHash };
}
