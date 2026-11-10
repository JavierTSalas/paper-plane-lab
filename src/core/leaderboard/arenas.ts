import { THROW_LIMITS } from '../sim';
import type { Arena, RankCategory } from '../types';

/**
 * Physics version of ranked flights. Bump it whenever folding, the airframe, the aerodynamics, the wind or
 * the integrator change results: scores from different versions are not comparable, and the API refuses
 * submissions from another version.
 */
export const ENGINE_VERSION = 'ppl-sim-2026.11.10';

export const RANK_CATEGORIES: readonly RankCategory[] = ['distance', 'airtime'];

/** Player name of the lab's own reference flights. Never a person. */
export const HOUSE_PLAYER = 'Lab benchmark';

/**
 * Two arenas, each ranked for distance and for airtime (four boards). Both fly in the record hangar in still
 * air, as real competitions do (docs/research/04 section 5, docs/research/08 section 8: indoor, no wind,
 * first touch ends the flight). They differ only in the throw: 27 m/s is an elite time-aloft launch and
 * 10 m/s an everyday arm (docs/research/02 section 5, THROW_LIMITS).
 */
export const ARENAS: readonly Arena[] = [
  {
    id: 'open',
    name: 'Open Hangar',
    envId: 'hangar',
    conditions: { envId: 'hangar' },
    maxThrowSpeed: THROW_LIMITS.eliteSpeed,
    blurb:
      'Indoors in the record hangar, still air, one sheet, throws up to 27 m/s like the record holders. The flight ends at the first touch of floor, wall or ceiling.',
  },
  {
    id: 'classic',
    name: 'Classic Hangar',
    envId: 'hangar',
    conditions: { envId: 'hangar' },
    maxThrowSpeed: 10,
    blurb:
      'The same still hangar with an everyday arm: throws up to 10 m/s, so the folding matters more than the muscle. The flight ends at the first touch.',
  },
];

export function getArena(id: string): Arena | undefined {
  return ARENAS.find((a) => a.id === id);
}

export function isRankCategory(v: unknown): v is RankCategory {
  return v === 'distance' || v === 'airtime';
}

/** Every (arena, category) board. */
export function boards(arenas: readonly Arena[] = ARENAS): { arena: Arena; category: RankCategory }[] {
  return arenas.flatMap((arena) => RANK_CATEGORIES.map((category) => ({ arena, category })));
}

/** Stable text key of one board, e.g. "distance|open". */
export function boardKey(category: RankCategory, arenaId: string): string {
  return `${category}|${arenaId}`;
}
