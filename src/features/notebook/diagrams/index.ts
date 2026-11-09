/** Diagram ids, referenced by topic files. Components live in registry.tsx. */
export const DIAGRAM_IDS = [
  'sim-pipeline',
  'angle-of-attack',
  'glide-forces',
  'lift-curve',
  'cg-np',
  'elevator',
  'dihedral',
  'phugoid',
  'reynolds-scale',
  'wind-profile',
  'slope-lift',
  'paper-sizes',
  'layers',
  'fold-lines',
  'symmetry',
  'arena',
  'plane-parts',
] as const;

export type DiagramId = (typeof DIAGRAM_IDS)[number];
