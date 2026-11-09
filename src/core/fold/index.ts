/**
 * Paper folding engine: flat simple folds, crease bookkeeping, fold animation and the 3D pose.
 * See docs/ARCHITECTURE.md section 5 and docs/research/07-computational-origami.md.
 */
export { applyStep, createSheet, foldFlat, piecePolygon, tableBounds } from './flat';
export type { StepOutcome } from './flat';
export { isSymmetric, snapPoints } from './query';
export { bisectorOfLines, foldPointToPoint, mirrorLine, mirrorStep } from './lines';
export { frameAt } from './anim';
export type { AnimPiece } from './anim';
export { buildPlane, defaultShape, finalHingeAngles, poseModel, SHAPE_STEP } from './pose';
