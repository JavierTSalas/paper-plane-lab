/** Paper rendering: flat paper on a desk, the folding tutorial player, posed planes, thumbnails and crease patterns. */
export { PaperCanvas } from './PaperCanvas';
export type { PaperCanvasProps, PaperCanvasView } from './PaperCanvas';
export { FoldPlayer } from './FoldPlayer';
export type { FoldPlayerProps } from './FoldPlayer';
export { PlaneView } from './PlaneView';
export type { PlaneMarker, PlaneViewProps } from './PlaneView';
export { PlaneThumb, cachedPlane, geometryKey } from './PlaneThumb';
export type { PlaneThumbProps, ThumbView } from './PlaneThumb';
export { CreasePattern, shapeCreases } from './CreasePattern';
export type { CreasePatternProps } from './CreasePattern';
export type { SceneHighlight } from './SceneView';
export { buildTimeline, stepCaption, DESK_VIEW, THREE_QUARTER_VIEW } from './timeline';
export type { Timeline, Segment } from './timeline';
export * from './projector';
