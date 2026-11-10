/**
 * Small adapter to the leaderboard module, so the Fly screen works with or without it: the module is picked
 * up at build time if `src/core/leaderboard/index.ts` exists and exports ARENAS.
 */
import type { Arena, Conditions, Launch } from '../../core/types';

interface LeaderboardModule {
  ARENAS?: readonly Arena[];
}

const found = import.meta.glob<LeaderboardModule>('../../core/leaderboard/index.ts', { eager: true });

export function arenas(): readonly Arena[] {
  for (const mod of Object.values(found)) if (Array.isArray(mod.ARENAS)) return mod.ARENAS;
  return [];
}

const same = (a: number | undefined, b: number | undefined): boolean => (a === undefined && b === undefined) || (a !== undefined && b !== undefined && Math.abs(a - b) < 1e-9);

/** Arenas whose fixed conditions this throw met: same place, same wind settings, no faster than allowed. */
export function matchingArenas(conditions: Conditions, launch: Launch, list: readonly Arena[] = arenas()): Arena[] {
  return list.filter(
    (a) =>
      a.envId === conditions.envId &&
      same(a.conditions.windSpeed, conditions.windSpeed) &&
      same(a.conditions.windTowardDeg, conditions.windTowardDeg) &&
      same(a.conditions.gustiness, conditions.gustiness) &&
      launch.speed <= a.maxThrowSpeed + 1e-9,
  );
}
