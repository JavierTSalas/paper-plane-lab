import type { FlightMetrics, RankCategory } from '../types';

/**
 * The ranked number of a flight: distance in metres (release point to first touch, horizontal) or airtime in
 * seconds (release to first touch). Rounded to whole millimetres / milliseconds so scores are exact integers
 * in storage (docs/research/08 section 2.4).
 */
export function scoreOf(category: RankCategory, metrics: FlightMetrics): number {
  const raw = category === 'distance' ? metrics.distance : metrics.airtime;
  return Number.isFinite(raw) ? Math.round(raw * 1000) / 1000 : 0;
}

/** Integer score for storage keys: millimetres or milliseconds. */
export function scoreToInt(score: number): number {
  return Math.max(0, Math.round(score * 1000));
}

/** Relative and absolute tolerance of a claimed score against the re-simulation. */
export const SCORE_TOLERANCE = {
  relative: 0.005,
  /** Metres for distance (2 cm), seconds for airtime (20 ms). */
  absolute: { distance: 0.02, airtime: 0.02 } as Record<RankCategory, number>,
} as const;

export function scoresMatch(category: RankCategory, claimed: number, server: number): boolean {
  if (!Number.isFinite(claimed)) return false;
  const tol = Math.max(SCORE_TOLERANCE.absolute[category], SCORE_TOLERANCE.relative * Math.abs(server));
  return Math.abs(claimed - server) <= tol;
}

/** Display text: "12.34 m" / "40.5 ft" for distance, "3.42 s" for airtime. */
export function formatScore(category: RankCategory, score: number, units: 'metric' | 'imperial' = 'metric'): string {
  if (category === 'airtime') return `${score.toFixed(2)} s`;
  if (units === 'imperial') return `${(score / 0.3048).toFixed(1)} ft`;
  return `${score.toFixed(2)} m`;
}

/** Higher is better in both categories. Ties go to the earlier entry. */
export function compareEntries(a: { score: number; createdAt: string }, b: { score: number; createdAt: string }): number {
  return b.score - a.score || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
}
