import { useMemo } from 'react';
import { buildAirframe } from '../core/airframe';
import { defaultDesign } from '../core/designs';
import { buildPlane } from '../core/fold';
import { STANDARD_AIR } from '../core/aero';
import { analyzeTrim } from '../core/tunnel';
import type { Air, Airframe, FoldIssue, FoldResult, PlaneDesign, PosedModel, TrimAnalysis } from '../core/types';
import { useCurrentPlane } from './store';

export { STANDARD_AIR };

/** Everything derived from a design. Never stored; recomputed and cached here. */
export interface PlaneBuild {
  design: PlaneDesign;
  fold: FoldResult;
  model: PosedModel;
  airframe: Airframe;
  /** Fold and shape issues, fold issues first. */
  issues: FoldIssue[];
  /** Stable key of the folded geometry (paper size, steps, shape). Colours and names do not change it. */
  geometryKey: string;
  /** Geometry plus trim: changes whenever the flight behaviour can change. */
  flightKey: string;
}

/** Key of the folded geometry. Two designs with the same key fold into the same shape. */
export function geometryKey(design: PlaneDesign): string {
  return JSON.stringify([design.paper.width, design.paper.height, design.steps, design.shape]);
}

/** Key of everything that affects flight: geometry and trim. */
export function flightKey(design: PlaneDesign): string {
  return `${geometryKey(design)}|${JSON.stringify(design.trim)}`;
}

interface Folded {
  fold: FoldResult;
  model: PosedModel;
  issues: FoldIssue[];
}

const FOLD_CACHE_SIZE = 48;
const BUILD_CACHE_SIZE = 96;
const foldCache = new Map<string, Folded>();
const buildCache = new Map<string, Omit<PlaneBuild, 'design'>>();

function remember<V>(cache: Map<string, V>, key: string, limit: number, make: () => V): V {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = make();
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value as string);
  return value;
}

/** Fold, pose and build the airframe of a design, with caching. Pure apart from the cache. */
export function getPlaneBuild(design: PlaneDesign): PlaneBuild {
  const gKey = geometryKey(design);
  const fKey = flightKey(design);
  const built = remember(buildCache, fKey, BUILD_CACHE_SIZE, () => {
    const folded = remember(foldCache, gKey, FOLD_CACHE_SIZE, () => buildPlane(design));
    return {
      fold: folded.fold,
      model: folded.model,
      issues: folded.issues,
      airframe: buildAirframe(folded.model, design.trim),
      geometryKey: gKey,
      flightKey: fKey,
    };
  });
  return { design, ...built };
}

const trimCache = new WeakMap<Airframe, TrimAnalysis>();

/** Trim and stability analysis in standard air, cached per airframe. */
export function getTrimAnalysis(airframe: Airframe, air: Air = STANDARD_AIR): TrimAnalysis {
  if (air !== STANDARD_AIR) return analyzeTrim(airframe, air);
  let trim = trimCache.get(airframe);
  if (!trim) {
    trim = analyzeTrim(airframe, air);
    trimCache.set(airframe, trim);
  }
  return trim;
}

/** Derived data for a design, memoised. Returns null for a null design. */
export function usePlaneBuild(design: PlaneDesign | null): PlaneBuild | null {
  return useMemo(() => (design ? getPlaneBuild(design) : null), [design]);
}

/** Trim and stability numbers for a build in standard air. */
export function useTrimAnalysis(build: PlaneBuild | null): TrimAnalysis | null {
  return useMemo(() => (build ? getTrimAnalysis(build.airframe) : null), [build]);
}

let fallbackDesign: PlaneDesign | null = null;

/** The player's current plane, or a Classic Dart on white A4 when they have none yet. */
export function useCurrentDesign(): PlaneDesign {
  const current = useCurrentPlane();
  if (current) return current;
  fallbackDesign ??= defaultDesign();
  return fallbackDesign;
}
