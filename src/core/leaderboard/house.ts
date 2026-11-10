/**
 * "Lab benchmark" reference flights: the preset planes flown by the simulator itself, so a fresh board is
 * never empty and never shows invented people. Each plane gets a deterministic coarse search over throw speed
 * (up to the arena cap) and throw angle; the best flight per category becomes a house entry with a full,
 * verifiable ticket.
 */
import { buildAirframe } from '../airframe';
import { getEnvironment } from '../env';
import { buildPlane } from '../fold';
import { simulateFlight } from '../sim';
import { geometryHash } from '../similarity';
import type { Airframe, Arena, FlightTicket, Launch, PlaneDesign, RankCategory, RankEntry } from '../types';
import { HOUSE_PLAYER, RANK_CATEGORIES } from './arenas';
import { scoreOf } from './score';
import { checkTicketRules, RANK_LIMITS } from './verify';

export const HOUSE_SEED = 1;
/** Fixed timestamp so house entries are identical on every device; they sort after a human at equal score. */
export const HOUSE_CREATED_AT = '2100-01-01T00:00:00.000Z';
/** Throw angles of the search, degrees. */
export const HOUSE_PITCHES_DEG: readonly number[] = [-5, 0, 5, 10, 20, 35, 50];
/** Fractions of the arena's speed cap tried by the search (never below the minimum throw). */
export const HOUSE_SPEED_FRACTIONS: readonly number[] = [0.3, 0.45, 0.6, 0.8, 1];
/** The coarse pass integrates with a larger step; the finalists are flown again at the default step. */
const COARSE_DT = 2.5e-3;
const FINALISTS = 2;

const cache = new Map<string, RankEntry[]>();

/** Drop the in-memory cache (tests, or after a physics change in a dev session). */
export function clearHouseCache(): void {
  cache.clear();
}

function launchOf(speed: number, pitchDeg: number): Launch {
  return { speed, pitchDeg, yawDeg: 0, rollDeg: 0, aoaDeg: 0 };
}

function speedsFor(arena: Arena): number[] {
  const out = new Set<number>();
  for (const f of HOUSE_SPEED_FRACTIONS) {
    out.add(Math.round(Math.max(RANK_LIMITS.minSpeed, f * arena.maxThrowSpeed) * 10) / 10);
  }
  return [...out];
}

function entriesFor(design: PlaneDesign, airframe: Airframe, hash: string, arena: Arena): RankEntry[] {
  const env = getEnvironment(arena.envId);
  const fly = (l: Launch, dt?: number) =>
    simulateFlight(airframe, l, env, arena.conditions, HOUSE_SEED, dt === undefined ? {} : { dt }).metrics;

  const coarse: { launch: Launch; scores: Record<RankCategory, number> }[] = [];
  for (const speed of speedsFor(arena)) {
    for (const pitchDeg of HOUSE_PITCHES_DEG) {
      const launch = launchOf(speed, pitchDeg);
      const m = fly(launch, COARSE_DT);
      coarse.push({ launch, scores: { distance: scoreOf('distance', m), airtime: scoreOf('airtime', m) } });
    }
  }

  const out: RankEntry[] = [];
  for (const category of RANK_CATEGORIES) {
    const finalists = [...coarse].sort((a, b) => b.scores[category] - a.scores[category]).slice(0, FINALISTS);
    let best: { launch: Launch; score: number } | null = null;
    for (const f of finalists) {
      const score = scoreOf(category, fly(f.launch));
      if (!best || score > best.score) best = { launch: f.launch, score };
    }
    if (!best) continue;
    const ticket: FlightTicket = { design, launch: best.launch, conditions: { ...arena.conditions }, seed: HOUSE_SEED };
    if (checkTicketRules(ticket, category, arena).length > 0) continue;
    out.push({
      id: `house-${arena.id}-${category}-${hash}`,
      category,
      arenaId: arena.id,
      player: HOUSE_PLAYER,
      planeName: design.name,
      designHash: hash,
      ...(design.presetId ? { presetId: design.presetId } : {}),
      paperSizeId: design.paper.sizeId,
      score: best.score,
      createdAt: HOUSE_CREATED_AT,
      origin: 'house',
      ticket,
    });
  }
  return out;
}

/**
 * Reference flights of `designs` on `arenas`, both categories. Computed lazily (about 40 simulations per
 * plane and arena, a fraction of a second each pair) and cached in memory per design and arena.
 * Designs that do not fold cleanly or break the arena rules (e.g. a paper clip) are skipped.
 */
export function houseEntries(designs: readonly PlaneDesign[], arenas: readonly Arena[]): RankEntry[] {
  const out: RankEntry[] = [];
  for (const design of designs) {
    const designKey = JSON.stringify(design);
    let built: { airframe: Airframe; hash: string } | null | undefined;
    for (const arena of arenas) {
      const key = `${arena.id}|${JSON.stringify(arena.conditions)}|${arena.maxThrowSpeed}|${designKey}`;
      let entries = cache.get(key);
      if (!entries) {
        if (built === undefined) {
          const plane = buildPlane(design);
          built = plane.issues.some((i) => i.severity === 'error')
            ? null
            : { airframe: buildAirframe(plane.model, design.trim), hash: geometryHash(plane.model) };
        }
        entries = built ? entriesFor(design, built.airframe, built.hash, arena) : [];
        cache.set(key, entries);
      }
      out.push(...entries);
    }
  }
  return out;
}
