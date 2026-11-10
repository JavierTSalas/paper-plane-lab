import { getEnvironment } from '../../core/env';
import { getPreset, makeDesign, PRESETS, presetPaper, type PlanePreset } from '../../core/designs';
import { describeMatch, fingerprint, rankSimilar, type MatchLabel, type SimilarityCandidate } from '../../core/similarity';
import type { DiagnosisCode, Fingerprint, PlaneCategory, PlaneDesign, SimilarityMatch } from '../../core/types';
import { getPlaneBuild } from '../../app/hooks';
import type { Tone } from '../../ui/Card';

/* ------------------------------------------------------------------ preset designs */

let presetDesigns: PlaneDesign[] | null = null;

/** Every preset folded on its recommended sheet, in white. Built once. */
export function getPresetDesigns(): readonly PlaneDesign[] {
  presetDesigns ??= PRESETS.map((p) => makeDesign(p, presetPaper(p)));
  return presetDesigns;
}

export function presetDesign(id: string): PlaneDesign | undefined {
  return getPresetDesigns().find((d) => d.presetId === id);
}

/* ------------------------------------------------------------------ fingerprints */

const fpCache = new WeakMap<PlaneDesign, Fingerprint>();

/** Fingerprint of a design (cached per design object). */
export function designFingerprint(design: PlaneDesign): Fingerprint {
  let fp = fpCache.get(design);
  if (!fp) {
    const build = getPlaneBuild(design);
    fp = fingerprint(build.model, build.airframe);
    fpCache.set(design, fp);
  }
  return fp;
}

let presetCandidates: SimilarityCandidate[] | null = null;

/** The presets as similarity candidates; candidate id = preset id. */
export function getPresetCandidates(): readonly SimilarityCandidate[] {
  presetCandidates ??= getPresetDesigns().map((d) => ({ id: d.presetId ?? d.id, name: d.name, fingerprint: designFingerprint(d) }));
  return presetCandidates;
}

export interface LookAlike extends SimilarityMatch {
  label: MatchLabel;
}

/** The presets this design most resembles, best first. */
export function presetLookAlikes(design: PlaneDesign, limit = 3): LookAlike[] {
  return rankSimilar(designFingerprint(design), getPresetCandidates(), limit).map((m) => ({ ...m, label: describeMatch(m.score) }));
}

/* ------------------------------------------------------------------ wording */

export const CATEGORY_LABEL: Record<PlaneCategory, string> = {
  dart: 'Dart',
  glider: 'Glider',
  hybrid: 'Hybrid',
  wing: 'Flying wing',
  custom: 'Own design',
};

export const CATEGORY_TONE: Record<PlaneCategory, Tone> = {
  dart: 'accent',
  glider: 'sky',
  hybrid: 'sage',
  wing: 'plum',
  custom: 'mustard',
};

/** What each family is good at, for the preset sheet. */
export const CATEGORY_STRENGTH: Record<PlaneCategory, string> = {
  dart: 'Speed and distance. A narrow, nose-heavy dart cuts through the air and shrugs off a hard throw.',
  glider: 'Time aloft. Broad, light wings let it sink slowly; throw it gently and let it float.',
  hybrid: 'A bit of both: it takes a firm throw like a dart and still settles into a real glide.',
  wing: 'A smooth, slow glide with no fuselage at all. It needs careful trim but rewards it.',
  custom: 'Whatever you fold into it.',
};

export const MATCH_WORD: Record<MatchLabel, string> = {
  identical: 'Identical',
  'near-identical': 'Near-identical',
  similar: 'Similar',
  related: 'Related',
  different: 'Different',
};

export const DIAGNOSIS_LABEL: Record<DiagnosisCode, string> = {
  'clean-glide': 'Clean glide',
  'nose-dive': 'Nose dive',
  'stall-mush': 'Stall',
  porpoise: 'Porpoising',
  loop: 'Loop',
  spiral: 'Spiral',
  'roll-off': 'Rolled off',
  tumble: 'Tumble',
  'wind-carried': 'Wind-carried',
  'hit-wall': 'Hit a wall',
  'hit-ceiling': 'Hit the ceiling',
  'too-slow': 'Too slow',
  ballistic: 'Ballistic',
};

export function diagnosisTone(code: DiagnosisCode): 'good' | 'warn' | 'bad' | 'neutral' {
  if (code === 'clean-glide') return 'good';
  if (code === 'wind-carried' || code === 'ballistic') return 'neutral';
  if (code === 'tumble' || code === 'nose-dive' || code === 'hit-wall' || code === 'hit-ceiling') return 'bad';
  return 'warn';
}

export function envName(id: string): string {
  try {
    return getEnvironment(id).name;
  } catch {
    return id;
  }
}

export function presetOf(design: PlaneDesign): PlanePreset | undefined {
  return design.presetId ? getPreset(design.presetId) : undefined;
}

/* ------------------------------------------------------------------ ids */

/** A fresh, collision-safe plane id (UI side: wall clock and randomness are fine here). */
export function newPlaneId(prefix = 'plane'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000).toString(36)}`;
}

/** "Name", "Name (copy)", "Name (copy 2)"... avoiding names already taken. */
export function copyName(name: string, taken: readonly string[]): string {
  const base = name.replace(/\s*\(copy(?: \d+)?\)$/, '');
  const set = new Set(taken.map((n) => n.toLowerCase()));
  let candidate = `${base} (copy)`;
  for (let i = 2; set.has(candidate.toLowerCase()); i++) candidate = `${base} (copy ${i})`;
  return candidate.slice(0, 40);
}
