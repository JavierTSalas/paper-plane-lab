import type { FoldStep, PaperSpec, PlaneCategory, ShapeSpec, TrimSpec } from '../types';

/** What a preset produces for one concrete sheet. */
export interface PresetBuild {
  steps: FoldStep[];
  shape: ShapeSpec;
  trim: TrimSpec;
}

/**
 * A preset airplane. One file per plane in ./presets, registered in ./presets/index.ts.
 * Fold lines are computed from the sheet's width and height, never hard-coded for one size.
 */
export interface PlanePreset {
  id: string;
  name: string;
  category: PlaneCategory;
  /** Only when the research notes support it. */
  designer?: string;
  year?: string;
  /** One line. */
  blurb: string;
  /** Two to four sentences: origin, what it is good at, why. */
  story: string;
  difficulty: 1 | 2 | 3;
  orientation: 'portrait' | 'landscape';
  /** Ideal sheet. The preset still folds on any size. */
  recommendedSizeId: string;
  /**
   * documented: the fold sequence follows published instructions.
   * approximate: a simple-fold approximation; say what differs in `fidelityNote`.
   */
  fidelity: 'documented' | 'approximate';
  fidelityNote?: string;
  build(paper: PaperSpec): PresetBuild;
  /** A good first throw. Speed in m/s, pitch in degrees above the horizon. */
  throwHint: { speed: number; pitchDeg: number; note: string };
  /** URLs from docs/research. */
  sources: string[];
}
