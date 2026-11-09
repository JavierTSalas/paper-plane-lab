import type { Fingerprint, SimilarityMatch } from '../types';

/*
 * All weights and tolerances below are design choices from the similarity task spec
 * (docs/ARCHITECTURE.md section 8 gives no numbers; the research docs give none either).
 * Each per-feature kernel is a Gaussian exp(-0.5 (d / tol)^2) of a difference d.
 */

/** Weight of the grid term; the feature term gets the rest (task spec: 0.65 / 0.35). */
export const GRID_WEIGHT = 0.65;
export const FEATURE_WEIGHT = 1 - GRID_WEIGHT;

/** Ratio features are compared as log differences; this floor keeps log() finite for zero values. */
const RATIO_FLOOR = 1e-3;
/** Aspect ratio, log space: 0.25 = a ratio of e^0.25 = 1.28 drops the kernel to 0.61 (design choice). */
const TOL_LOG_ASPECT = 0.25;
/** CG position as a fraction of length: about 0.05 (task spec). */
const TOL_CG = 0.05;
/** Wing area / sheet area, log space (design choice; folds change the ratio by tens of percent). */
const TOL_LOG_AREA = 0.25;
/** Keel depth / length, absolute (design choice; flat gliders 0, deep-keel darts about 0.15). */
const TOL_KEEL = 0.05;
/** Span / length, log space (design choice). */
const TOL_LOG_SLENDER = 0.2;

const logRatio = (a: number, b: number): number =>
  Math.log(Math.max(a, RATIO_FLOOR)) - Math.log(Math.max(b, RATIO_FLOOR));

const kernel = (d: number, tol: number): number => {
  const t = d / tol;
  return Math.exp(-0.5 * t * t);
};

/**
 * Weighted Jaccard (Ruzicka) similarity, sum of min / sum of max, of the two grids rescaled to unit
 * sum (top-view mass distributions). Stored grids are max-normalised per the contract, but comparing
 * them directly lets one small thick patch (an extra nose layer raising the peak from 2 to 3 layers)
 * rescale every other cell by 2/3 and cost about 0.27 of grid score. On unit-sum grids the same patch
 * costs roughly its share of the paper mass. Two empty grids are identical; one empty grid scores 0.
 */
export function gridSimilarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  let sumA = 0;
  let sumB = 0;
  for (let k = 0; k < a.length; k++) sumA += a[k];
  for (let k = 0; k < b.length; k++) sumB += b[k];
  if (!(sumA > 0) || !(sumB > 0)) return sumA > 0 || sumB > 0 ? 0 : 1;
  const ia = 1 / sumA;
  const ib = 1 / sumB;
  let sMin = 0;
  let sMax = 0;
  for (let k = 0; k < n; k++) {
    const x = k < a.length ? a[k] * ia : 0;
    const y = k < b.length ? b[k] * ib : 0;
    if (x < y) {
      sMin += x;
      sMax += y;
    } else {
      sMin += y;
      sMax += x;
    }
  }
  return sMin / sMax;
}

/** Product of the per-feature kernels, 0..1. */
export function featureSimilarity(a: Fingerprint, b: Fingerprint): number {
  return (
    kernel(logRatio(a.aspectRatio, b.aspectRatio), TOL_LOG_ASPECT) *
    kernel(a.cgFromNose - b.cgFromNose, TOL_CG) *
    kernel(logRatio(a.areaRatio, b.areaRatio), TOL_LOG_AREA) *
    kernel(a.keelDepthRatio - b.keelDepthRatio, TOL_KEEL) *
    kernel(logRatio(a.slenderness, b.slenderness), TOL_LOG_SLENDER)
  );
}

/** Similarity of two fingerprints in 0..1. Symmetric; similarity(a, a) = 1. */
export function similarity(a: Fingerprint, b: Fingerprint): number {
  const s = GRID_WEIGHT * gridSimilarity(a.grid, b.grid) + FEATURE_WEIGHT * featureSimilarity(a, b);
  if (!(s > 0)) return 0;
  return s > 1 ? 1 : s;
}

export interface SimilarityCandidate {
  id: string;
  name: string;
  fingerprint: Fingerprint;
}

/** Best `limit` matches, score descending; ties broken by id so the order is deterministic. */
export function rankSimilar(
  target: Fingerprint,
  candidates: readonly SimilarityCandidate[],
  limit = 5,
): SimilarityMatch[] {
  const n = Math.max(0, Math.floor(limit));
  if (n === 0) return [];
  const scored: SimilarityMatch[] = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    score: similarity(target, c.fingerprint),
  }));
  scored.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return scored.slice(0, n);
}

export type MatchLabel = 'identical' | 'near-identical' | 'similar' | 'related' | 'different';

/**
 * UI wording thresholds (design choice, tuned on the test fixtures):
 *  >= 0.995 identical       same fold, at most rounding or a different sheet size
 *  >= 0.93  near-identical  same plane with a small change (fixture: one extra nose layer scores 0.937)
 *  >= 0.80  similar         same family, visibly different proportions
 *  >= 0.60  related         shares the general layout (both darts, both gliders)
 *  below    different       (fixture: delta dart vs wide glider scores 0.11)
 */
export const MATCH_THRESHOLDS = {
  identical: 0.995,
  nearIdentical: 0.93,
  similar: 0.8,
  related: 0.6,
} as const;

export function describeMatch(score: number): MatchLabel {
  if (score >= MATCH_THRESHOLDS.identical) return 'identical';
  if (score >= MATCH_THRESHOLDS.nearIdentical) return 'near-identical';
  if (score >= MATCH_THRESHOLDS.similar) return 'similar';
  if (score >= MATCH_THRESHOLDS.related) return 'related';
  return 'different';
}
