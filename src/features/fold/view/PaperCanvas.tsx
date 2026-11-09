import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import type { AnimPiece } from '../../../core/fold';
import type { Crease, FlatState, PaperSpec, StepFrame, Vec2, Vec3 } from '../../../core/types';
import { pitchFromTilt, screenBounds, unionBounds } from './projector';
import { facesFromAnim, facesFromFlat, facesFromFrame, LAYER_GAP, type SceneFace } from './scene';
import { SceneView, type SceneHandle, type SceneHighlight } from './SceneView';

export interface PaperCanvasView {
  /** Screen pixels per metre of table, for sizing overlay handles. */
  pxPerMetre: number;
}

export interface PaperCanvasProps {
  paper: PaperSpec;
  /** A flat-folded state lying on the desk. One of state, frame or pieces is drawn (in that priority). */
  state?: FlatState | null;
  /** A fold step at progress `t`; gives the best layer order while a flap swings. */
  frame?: StepFrame | null;
  t?: number;
  /** Bare animation pieces, e.g. from frameAt. */
  pieces?: readonly AnimPiece[] | null;
  /** Degrees away from straight down. 0 = the precise top view editors hit-test against. Default 25. */
  tilt?: number;
  /** Turn of the camera about the vertical, degrees. Default 0. */
  yaw?: number;
  /** Draw crease lines on the paper. Default true. */
  showCreases?: boolean;
  /** Creases to draw (sheet coordinates). Default: `state.creases`, or the frame's. */
  creases?: readonly Crease[] | null;
  /** A fold line in Yoshizawa-Randlett style: valley dashed, mountain dash-dot. */
  highlight?: SceneHighlight | null;
  /** A translucent preview drawn above the paper, e.g. the result of the fold being dragged. */
  ghost?: readonly AnimPiece[] | FlatState | null;
  /** Table region kept in view. Default: the whole sheet plus whatever lies outside it. */
  fitTo?: { min: Vec2; max: Vec2 } | null;
  /** Width / height. Default: from the fitted region. */
  aspect?: number;
  layerGap?: number;
  /** Soft contact shadow under the stack. Default true. */
  shadows?: boolean;
  /** Accessible description. */
  label?: string;
  /** Overlay drawn in table coordinates (metres, y up), above the paper. A function receives the scale. */
  children?: ReactNode | ((view: PaperCanvasView) => ReactNode);
  /** Pointer callbacks with the TABLE point under the pointer (metres). Exact at tilt 0. */
  onTablePointerDown?: (p: Vec2, e: PointerEvent<SVGSVGElement>) => void;
  onTablePointerMove?: (p: Vec2, e: PointerEvent<SVGSVGElement>) => void;
  onTablePointerUp?: (p: Vec2, e: PointerEvent<SVGSVGElement>) => void;
  className?: string;
}

const isFlat = (g: readonly AnimPiece[] | FlatState): g is FlatState => !Array.isArray(g);

/** Paper on a desk: a flat-folded state or one instant of a fold, with layers, shading and a soft shadow. */
export function PaperCanvas({
  paper,
  state,
  frame,
  t = 0,
  pieces,
  tilt = 25,
  yaw = 0,
  showCreases = true,
  creases,
  highlight = null,
  ghost = null,
  fitTo = null,
  aspect,
  layerGap = LAYER_GAP,
  shadows = true,
  label = 'Folded paper',
  children,
  onTablePointerDown,
  onTablePointerMove,
  onTablePointerUp,
  className,
}: PaperCanvasProps): ReactElement {
  const scene = useRef<SceneHandle>(null);
  const pitch = pitchFromTilt(tilt);

  const faces: SceneFace[] = useMemo(() => {
    if (state) return facesFromFlat(state, layerGap);
    if (frame) return facesFromFrame(frame, t, layerGap);
    if (pieces) return facesFromAnim(pieces);
    return [];
  }, [state, frame, t, pieces, layerGap]);

  const ghostFaces = useMemo(() => (ghost ? (isFlat(ghost) ? facesFromFlat(ghost, layerGap) : facesFromAnim(ghost)) : null), [ghost, layerGap]);

  const crs = showCreases ? (creases ?? state?.creases ?? (frame ? (t >= 1 ? frame.after.creases : frame.before.creases) : null)) : null;

  let topZ = 0;
  for (const f of faces) for (const v of f.verts) topZ = Math.max(topZ, v[2]);

  const fit = useMemo(() => {
    const region = fitTo ?? { min: [0, 0] as Vec2, max: [paper.width, paper.height] as Vec2 };
    const corners: Vec3[] = [
      [region.min[0], region.min[1], 0],
      [region.max[0], region.min[1], 0],
      [region.max[0], region.max[1], 0],
      [region.min[0], region.max[1], 0],
    ];
    const pts: Vec3[] = fitTo ? corners : [...corners, ...faces.flatMap((f) => f.verts)];
    return unionBounds(screenBounds(pts, yaw, pitch), null)!;
  }, [fitTo, paper.width, paper.height, faces, yaw, pitch]);

  const ratio = aspect ?? Math.min(1.8, Math.max(0.55, (fit.max[0] - fit.min[0]) / Math.max(1e-9, fit.max[1] - fit.min[1])));
  const [pxPerMetre, setPx] = useState(1500);

  const redraw = useCallback(() => {
    scene.current?.draw({
      faces,
      paper,
      yaw,
      pitch,
      fit,
      creases: crs,
      shadows,
      highlight,
      overlayZ: topZ,
      ghost: ghostFaces,
    });
    const s = scene.current?.camera()?.scale;
    if (s && Math.abs(s - pxPerMetre) / pxPerMetre > 0.01) setPx(s);
  }, [faces, paper, yaw, pitch, fit, crs, shadows, highlight, topZ, ghostFaces, pxPerMetre]);

  useLayoutEffect(redraw, [redraw]);

  const handler = (cb?: (p: Vec2, e: PointerEvent<SVGSVGElement>) => void) =>
    cb
      ? (e: PointerEvent<SVGSVGElement>) => {
          const p = scene.current?.toTable(e.clientX, e.clientY);
          if (p) cb(p, e);
        }
      : undefined;

  return (
    <SceneView
      ref={scene}
      aspect={ratio}
      label={label}
      className={className}
      printScale={pxPerMetre}
      onResize={redraw}
      svgProps={{
        onPointerDown: handler(onTablePointerDown),
        onPointerMove: handler(onTablePointerMove),
        onPointerUp: handler(onTablePointerUp),
      }}
    >
      {typeof children === 'function' ? children({ pxPerMetre }) : children}
    </SceneView>
  );
}
