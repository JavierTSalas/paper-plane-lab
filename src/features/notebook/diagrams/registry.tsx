import type { ComponentType } from 'react';
import { ReynoldsScale, SlopeLift, WindProfile } from './air';
import { AngleOfAttack, GlideForces, LiftCurve, SimPipeline } from './flight';
import type { DiagramId } from './index';
import { ArenaDiagram, PlaneParts } from './misc';
import { FoldLines, Layers, PaperSizes, Symmetry } from './paperDiagrams';
import { CgNp, Dihedral, Elevator, Phugoid } from './stability';

export const DIAGRAMS: Record<DiagramId, ComponentType> = {
  'sim-pipeline': SimPipeline,
  'angle-of-attack': AngleOfAttack,
  'glide-forces': GlideForces,
  'lift-curve': LiftCurve,
  'cg-np': CgNp,
  elevator: Elevator,
  dihedral: Dihedral,
  phugoid: Phugoid,
  'reynolds-scale': ReynoldsScale,
  'wind-profile': WindProfile,
  'slope-lift': SlopeLift,
  'paper-sizes': PaperSizes,
  layers: Layers,
  'fold-lines': FoldLines,
  symmetry: Symmetry,
  arena: ArenaDiagram,
  'plane-parts': PlaneParts,
};
