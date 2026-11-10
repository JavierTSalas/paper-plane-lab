/**
 * Calibration support: build a preset into an airframe and measure it in the virtual tunnel and in flight.
 * Used by the preset tests and by the calibration table (`npx vitest run src/core/designs/calibration`).
 * Pure functions of their arguments; nothing here runs in the app's hot paths.
 */
import { buildAirframe } from '../airframe';
import { buildPlane } from '../fold';
import { makePaper } from '../paper';
import { simulateFlight } from '../sim';
import { analyzeTrim } from '../tunnel';
import type {
  Air, Airframe, Environment, FlightResult, FoldIssue, FoldResult, Launch, PlaneDesign, PosedModel, TrimAnalysis,
} from '../types';
import { airFrom } from '../wind';
import { makeDesign } from './index';
import type { DesignOverrides } from './index';
import type { PlanePreset } from './types';

export interface BuiltPreset {
  design: PlaneDesign;
  fold: FoldResult;
  model: PosedModel;
  issues: FoldIssue[];
  airframe: Airframe;
}

/** Fold a preset on a sheet of the given size (in the preset's own orientation) and build its airframe. */
export function buildPreset(preset: PlanePreset, sizeId: string = preset.recommendedSizeId, overrides: DesignOverrides = {}): BuiltPreset {
  const paper = makePaper({ sizeId, orientation: preset.orientation });
  const design = makeDesign(preset, paper, overrides);
  const { fold, model, issues } = buildPlane(design);
  return { design, fold, model, issues, airframe: buildAirframe(model, design.trim) };
}

export const airOf = (env: Environment): Air => airFrom(env.tempC, env.pressurePa, env.humidity);

export const throwAt = (speed: number, pitchDeg: number): Launch => ({ speed, pitchDeg, yawDeg: 0, rollDeg: 0, aoaDeg: 0 });

/** The numbers of one preset on one sheet that the calibration table and the snapshot test lock. */
export interface PresetNumbers {
  id: string;
  sizeId: string;
  massG: number;
  spanMm: number;
  lengthMm: number;
  aspectRatio: number;
  /** Centre of gravity, percent of the length behind the nose. */
  cgPct: number;
  trim: TrimAnalysis;
}

export function measurePreset(preset: PlanePreset, sizeId: string, air: Air, overrides: DesignOverrides = {}): PresetNumbers {
  const { airframe, model } = buildPreset(preset, sizeId, overrides);
  return {
    id: preset.id,
    sizeId,
    massG: airframe.mass * 1000,
    spanMm: model.span * 1000,
    lengthMm: model.length * 1000,
    aspectRatio: airframe.ref.aspectRatio,
    cgPct: airframe.cgFromNose * 100,
    trim: analyzeTrim(airframe, air),
  };
}

export interface ThrowOutcome {
  pitchDeg: number;
  elevatorDeg: number;
  distance: number;
  airtime: number;
  result: FlightResult;
}

export interface ThrowSearch {
  bestDistance: ThrowOutcome;
  bestAirtime: ThrowOutcome;
}

/**
 * Coarse search over launch pitch and elevator setting at one release speed: the farthest and the longest
 * flight. A flight that ends on a wall or the ceiling counts with what it had reached by then.
 * The elevator candidates default to the preset's own setting; record throws use less (the arenas let
 * players re-trim, and a real thrower flattens the trailing edge for a hard throw).
 */
export function searchThrow(
  preset: PlanePreset,
  sizeId: string,
  env: Environment,
  speed: number,
  pitchesDeg: readonly number[],
  elevatorsDeg: readonly (number | null)[] = [null],
  seed = 1,
): ThrowSearch {
  let bestDistance: ThrowOutcome | null = null;
  let bestAirtime: ThrowOutcome | null = null;
  for (const elevator of elevatorsDeg) {
    const built = buildPreset(preset, sizeId, elevator === null ? {} : { trim: { elevatorDeg: elevator } });
    for (const pitchDeg of pitchesDeg) {
      const result = simulateFlight(built.airframe, throwAt(speed, pitchDeg), env, { envId: env.id }, seed);
      const outcome: ThrowOutcome = {
        pitchDeg,
        elevatorDeg: built.design.trim.elevatorDeg,
        distance: result.metrics.distance,
        airtime: result.metrics.airtime,
        result,
      };
      if (!bestDistance || outcome.distance > bestDistance.distance) bestDistance = outcome;
      if (!bestAirtime || outcome.airtime > bestAirtime.airtime) bestAirtime = outcome;
    }
  }
  if (!bestDistance || !bestAirtime) throw new Error('searchThrow needs at least one pitch and one elevator setting');
  return { bestDistance, bestAirtime };
}
