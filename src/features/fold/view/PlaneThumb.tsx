import { memo, useId, type ReactElement } from 'react';
import { buildPlane } from '../../../core/fold';
import type { FlatState, PlaneDesign, PosedModel } from '../../../core/types';
import { cx } from '../../../ui/cx';
import { PaperPatternDefs, paperFaceFill } from '../../../ui/paper';
import { fitPoints } from './projector';
import { composeScene, facesFromModel, matrixAttr, polyPath, shadeColor, type DrawFace } from './scene';
import { THREE_QUARTER_VIEW } from './timeline';
import './view.css';

export type ThumbView = 'top' | 'three-quarter' | 'side';

export interface PlaneThumbProps {
  design: PlaneDesign;
  /** Default 'three-quarter'. */
  view?: ThumbView;
  /** Width in px. Height is 3/4 of it (square for 'top'). Default 120. */
  size?: number;
  className?: string;
}

const VIEWS: Record<ThumbView, { yaw: number; pitch: number }> = {
  top: { yaw: 0, pitch: 90 },
  'three-quarter': THREE_QUARTER_VIEW,
  side: { yaw: 90, pitch: 0 },
};

interface Built {
  model: PosedModel;
  flat: FlatState;
}

/** Geometry depends only on the sheet size, the steps and the shape; colours and trim are not part of the key. */
export const geometryKey = (d: PlaneDesign): string => JSON.stringify([d.paper.width, d.paper.height, d.steps, d.shape]);

const MAX_CACHE = 120;
const builtCache = new Map<string, Built>();
const drawCache = new Map<string, { faces: DrawFace[]; w: number; h: number }>();

function remember<V>(cache: Map<string, V>, key: string, make: () => V): V {
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const v = make();
  cache.set(key, v);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return v;
}

/** The posed model of a design, memoised by its geometry. */
export function cachedPlane(design: PlaneDesign): Built {
  return remember(builtCache, geometryKey(design), () => {
    const { fold, model } = buildPlane(design);
    return { model, flat: fold.final };
  });
}

function thumbFaces(design: PlaneDesign, view: ThumbView, size: number): { faces: DrawFace[]; w: number; h: number } {
  const geo = geometryKey(design);
  return remember(drawCache, `${geo}|${view}|${size}`, () => {
    const { model } = cachedPlane(design);
    const faces = facesFromModel(model, { gap: 0 });
    const v = VIEWS[view];
    const w = size;
    const h = view === 'top' ? size : Math.round(size * 0.75);
    const cam = fitPoints(faces.flatMap((f) => f.verts), v.yaw, v.pitch, { width: w, height: h, pad: Math.max(4, size * 0.06) });
    return { faces: cam ? composeScene(faces, cam, { shadows: view !== 'side', groundZ: -0.1 * model.length }) : [], w, h };
  });
}

/** A cheap, static picture of a design for cards and lists. */
export const PlaneThumb = memo(function PlaneThumb({ design, view = 'three-quarter', size = 120, className }: PlaneThumbProps): ReactElement {
  const prefix = useId().replace(/[:«»]/g, '');
  const { faces, w, h } = thumbFaces(design, view, size);
  const front = paperFaceFill(design.paper, 'front', prefix);
  const back = paperFaceFill(design.paper, 'back', prefix);
  return (
    <svg className={cx('ppl-thumb', className)} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${design.name}, ${view.replace('-', ' ')} view`}>
      <PaperPatternDefs idPrefix={prefix} unitsPerMetre={1.5} minLine={0.0008} />
      <g className="ppl-thumb__shadow">
        {faces.map((f) => (f.shadow ? <path key={f.key} d={polyPath(f.sheet)} transform={matrixAttr(f.shadow)} /> : null))}
      </g>
      {faces.map((f) => {
        if (!f.matrix) return null;
        const face = f.side === 'front' ? front : back;
        const d = polyPath(f.sheet);
        return (
          <g key={f.key} transform={matrixAttr(f.matrix)}>
            <path d={d} fill={shadeColor(face.base, f.shade)} className="ppl-thumb__face" vectorEffect="non-scaling-stroke" />
            {face.overlay && <path d={d} fill={face.overlay} />}
          </g>
        );
      })}
    </svg>
  );
});
