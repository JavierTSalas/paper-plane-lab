import { buildPlane, poseModel, tableBounds } from '../../../core/fold';
import type { FlatState, FoldResult, FoldStep, HingeAngles, PlaneDesign, PosedModel, StepFrame, Vec3 } from '../../../core/types';
import { finalHingeAngles } from '../../../core/fold';
import { pitchFromTilt, screenBounds, unionBounds, type ScreenBounds } from './projector';
import { facesFromFrame, facesFromModel, LAYER_GAP, type SceneFace } from './scene';
import type { SceneHighlight } from './SceneView';

/** Camera of the flat steps: the desk seen from 25 degrees off vertical. */
export const DESK_VIEW = { yaw: 0, pitch: pitchFromTilt(25) };
/** Three-quarter view the finished plane is shown from (desk frame: nose toward +y). */
export const THREE_QUARTER_VIEW = { yaw: 142, pitch: 24 };

export type ShapeStage = 'half' | 'wings' | 'open';

export type Segment =
  | { kind: 'flat'; frame: StepFrame; label: string; duration: number }
  | { kind: 'turn'; frame: StepFrame; label: string; duration: number }
  | { kind: 'shape'; stage: ShapeStage; from: HingeAngles; to: HingeAngles; orbit: boolean; label: string; duration: number };

export interface Timeline {
  design: PlaneDesign;
  fold: FoldResult;
  /** The flat model the 3D stages start from. */
  final: FlatState;
  segments: Segment[];
  /** Framing of each segment (unit-scale screen bounds over its whole motion). */
  fits: ScreenBounds[];
}

/** Player beat inside each step: the still before the motion and the still after, as fractions of the step. */
export const PRE = 0.2;
export const POST = 0.18;

const easeInOutSine = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

/** Motion progress 0..1 of a step at local position u in [0, 1]. Reduced motion cuts at the middle. */
export function motionAt(u: number, reduced: boolean): number {
  if (reduced) return u < 0.5 ? 0 : 1;
  const m = (u - PRE) / (1 - PRE - POST);
  return easeInOutSine(Math.min(1, Math.max(0, m)));
}

export function stepCaption(step: FoldStep): string {
  if (step.label) return step.label;
  if (step.kind === 'flip') return 'Turn the paper over.';
  if (step.kind === 'crease') return 'Fold along the dashed line, then unfold to leave a crease.';
  return step.dir === 'valley' ? 'Valley fold along the dashed line, toward you.' : 'Mountain fold along the line, away from you.';
}

const lerpAngles = (a: HingeAngles, b: HingeAngles, t: number): HingeAngles => ({
  keel: a.keel + (b.keel - a.keel) * t,
  wing: a.wing + (b.wing - a.wing) * t,
  winglet: a.winglet + (b.winglet - a.winglet) * t,
});

/** A turn-over of the finished flat model, for mountain keels (the keel then folds toward the viewer like a valley). */
function turnFrame(final: FlatState, index: number): StepFrame {
  return { index, step: { kind: 'flip', label: 'Turn the model over.' }, before: final, after: final, split: [], movingIds: [], axis: null, sense: 1 };
}

const ZERO: HingeAngles = { keel: 0, wing: 0, winglet: 0 };
/** Just short of closed and flat so touching layers never share a plane. */
const CLOSED_KEEL = Math.PI / 2 - 0.015;
const WING_DOWN = Math.PI * 0.965;

/** Every segment of a design's tutorial: the flat steps, then shaping. */
export function buildTimeline(design: PlaneDesign): Timeline {
  const { fold } = buildPlane(design);
  const final = fold.final;
  const segments: Segment[] = fold.frames.map((frame) => ({
    kind: 'flat',
    frame,
    label: stepCaption(frame.step),
    duration: frame.step.kind === 'crease' ? 2.8 : frame.step.kind === 'flip' ? 2 : 2.4,
  }));
  const shape = design.shape;
  const end = finalHingeAngles(shape);
  if (shape.keel === 'mountain') {
    segments.push({ kind: 'turn', frame: turnFrame(final, fold.frames.length), label: 'Turn the model over.', duration: 2 });
  }
  if (shape.keel !== 'none') {
    const half: HingeAngles = { keel: CLOSED_KEEL, wing: 0, winglet: 0 };
    segments.push({ kind: 'shape', stage: 'half', from: ZERO, to: half, orbit: false, label: 'Fold the plane in half along the centre crease.', duration: 2.6 });
    let open = half;
    if (shape.wingLine) {
      open = { keel: CLOSED_KEEL, wing: WING_DOWN, winglet: 0 };
      segments.push({ kind: 'shape', stage: 'wings', from: half, to: open, orbit: false, label: 'Fold each wing down along its wing line.', duration: 2.8 });
    }
    segments.push({ kind: 'shape', stage: 'open', from: open, to: end, orbit: true, label: openCaption(design), duration: 3 });
  } else {
    segments.push({ kind: 'shape', stage: 'open', from: ZERO, to: end, orbit: true, label: openCaption(design), duration: 3 });
  }
  const timeline: Timeline = { design, fold, final, segments, fits: [] };
  timeline.fits = segments.map((_, i) => segmentFit(timeline, i));
  // The flat steps share one framing so the sheet does not jump between them.
  const flatFit = timeline.fits.reduce<ScreenBounds | null>((acc, b, i) => (segments[i]!.kind === 'shape' ? acc : unionBounds(acc, b)), null);
  if (flatFit) segments.forEach((s, i) => s.kind !== 'shape' && (timeline.fits[i] = flatFit));
  return timeline;
}

function openCaption(design: PlaneDesign): string {
  const s = design.shape;
  if (s.wingletLine && s.wingletDeg !== 0) return `Open the wings and set the winglets ${s.wingletDeg > 0 ? 'up' : 'down'}.`;
  return s.keel === 'none' ? 'Bend the wings up a little.' : 'Open the wings until they sit nearly flat.';
}

export interface TimelineScene {
  faces: SceneFace[];
  yaw: number;
  pitch: number;
  creases: FlatState['creases'] | null;
  highlight: SceneHighlight | null;
  /** The posed model during shaping. */
  model: PosedModel | null;
}

const modelCache = new WeakMap<Timeline, Map<string, PosedModel>>();

function posed(tl: Timeline, angles: HingeAngles): PosedModel {
  let m = modelCache.get(tl);
  if (!m) modelCache.set(tl, (m = new Map()));
  const key = `${angles.keel.toFixed(4)}|${angles.wing.toFixed(4)}|${angles.winglet.toFixed(4)}`;
  const hit = m.get(key);
  if (hit) return hit;
  const model = poseModel(tl.final, tl.design.shape, angles).model;
  if (m.size > 600) m.clear();
  m.set(key, model);
  return model;
}

/** Where the 3D model sits on the desk so that, unfolded, it lies exactly where the flat model did. */
function deskOffset(tl: Timeline): Vec3 {
  let maxLayer = 0;
  for (const p of tl.final.pieces) maxLayer = Math.max(maxLayer, p.layer);
  const lift = tl.design.shape.keel === 'mountain' ? 0 : maxLayer * LAYER_GAP;
  return [tl.design.paper.width / 2, tableBounds(tl.final).min[1], lift];
}

/** The scene of segment `i` at local position u in [0, 1]. */
export function sceneAt(tl: Timeline, i: number, u: number, reduced: boolean): TimelineScene {
  const seg = tl.segments[i]!;
  const a = motionAt(u, reduced);
  if (seg.kind === 'flat' || seg.kind === 'turn') {
    const { frame } = seg;
    const crease = frame.step.kind === 'crease';
    // A crease step folds to the line and back.
    const t = crease ? (reduced ? 0 : Math.sin(Math.PI * a)) : a;
    const showAfter = crease ? a >= 0.5 || (reduced && u >= 0.5) : a >= 1;
    const fade = reduced ? (u < 0.5 ? 1 : 0) : 1 - Math.min(1, a / 0.3);
    const highlight: SceneHighlight | null =
      frame.axis && fade > 0 ? { line: frame.axis, dir: crease || frame.sense === 1 ? 'valley' : 'mountain', opacity: fade } : null;
    return {
      faces: facesFromFrame(frame, t),
      ...DESK_VIEW,
      creases: showAfter ? frame.after.creases : frame.before.creases,
      highlight,
      model: null,
    };
  }
  const angles = lerpAngles(seg.from, seg.to, a);
  const model = posed(tl, angles);
  const view = seg.orbit
    ? { yaw: DESK_VIEW.yaw + (THREE_QUARTER_VIEW.yaw - DESK_VIEW.yaw) * a, pitch: DESK_VIEW.pitch + (THREE_QUARTER_VIEW.pitch - DESK_VIEW.pitch) * a }
    : DESK_VIEW;
  return { faces: facesFromModel(model, { offset: deskOffset(tl) }), ...view, creases: tl.final.creases, highlight: null, model };
}

function segmentFit(tl: Timeline, i: number): ScreenBounds {
  let b: ScreenBounds | null = null;
  for (const u of [0, 0.3, 0.45, 0.55, 0.7, 1]) {
    const s = sceneAt(tl, i, u, false);
    b = unionBounds(b, screenBounds(s.faces.flatMap((f) => f.verts), s.yaw, s.pitch));
  }
  return b ?? { min: [0, 0], max: [1, 1] };
}

/** Framing at a position: blends from the previous segment's framing early in a shaping step. */
export function fitAt(tl: Timeline, i: number, u: number, reduced: boolean): ScreenBounds {
  const cur = tl.fits[i]!;
  if (i === 0 || reduced) return cur;
  const prev = tl.fits[i - 1]!;
  const k = easeInOutSine(Math.min(1, u / 0.45));
  if (k >= 1) return cur;
  return {
    min: [prev.min[0] + (cur.min[0] - prev.min[0]) * k, prev.min[1] + (cur.min[1] - prev.min[1]) * k],
    max: [prev.max[0] + (cur.max[0] - prev.max[0]) * k, prev.max[1] + (cur.max[1] - prev.max[1]) * k],
  };
}
