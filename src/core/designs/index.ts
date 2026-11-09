import { makePaper } from '../paper';
import type { PaperPatternId } from '../paper';
import type { PaperSpec, PlaneDesign, ShapeSpec, TrimSpec } from '../types';
import { PRESET_LIST } from './presets';
import type { PlanePreset } from './types';

export type { PlanePreset, PresetBuild } from './types';
export { creaseAlong, DEFAULT_TRIM, foldAlong, sideOf, withMirror } from './helpers';

export const PRESETS: readonly PlanePreset[] = PRESET_LIST;

export const DEFAULT_PRESET_ID = 'classic-dart';

export function getPreset(id: string): PlanePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export interface DesignOverrides {
  id?: string;
  name?: string;
  author?: string;
  shape?: Partial<ShapeSpec>;
  trim?: Partial<TrimSpec>;
}

/** A sheet in the preset's own orientation and recommended size. */
export function presetPaper(
  preset: PlanePreset,
  opts: { sizeId?: string; front?: string; back?: string; pattern?: PaperPatternId } = {},
): PaperSpec {
  return makePaper({
    sizeId: opts.sizeId ?? preset.recommendedSizeId,
    orientation: preset.orientation,
    front: opts.front,
    back: opts.back,
    pattern: opts.pattern,
  });
}

/** Fold a preset on a concrete sheet. Deterministic: the default id is derived from preset and size. */
export function makeDesign(preset: PlanePreset, paper: PaperSpec, overrides: DesignOverrides = {}): PlaneDesign {
  const built = preset.build(paper);
  return {
    v: 1,
    id: overrides.id ?? `${preset.id}@${paper.sizeId}`,
    name: overrides.name ?? preset.name,
    presetId: preset.id,
    ...(overrides.author ? { author: overrides.author } : {}),
    category: preset.category,
    paper,
    steps: built.steps,
    shape: { ...built.shape, ...overrides.shape },
    trim: { ...built.trim, ...overrides.trim },
  };
}

/** The plane shown when the player has none yet: a Classic Dart on white A4. */
export function defaultDesign(): PlaneDesign {
  const preset = getPreset(DEFAULT_PRESET_ID) ?? PRESETS[0]!;
  return makeDesign(preset, presetPaper(preset));
}
