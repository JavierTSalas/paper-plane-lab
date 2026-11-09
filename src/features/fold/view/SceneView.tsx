import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode, type Ref, type SVGProps } from 'react';
import type { Crease, FoldLine, PaperSpec, Vec2, Vec3 } from '../../../core/types';
import { cx } from '../../../ui/cx';
import { PaperPatternDefs } from '../../../ui/paper';
import { fitBounds, projectWith, cameraBasis, unprojectToPlane, type Camera, type ScreenBounds } from './projector';
import { FaceRenderer } from './renderer';
import { composeScene, facesBounds, lineInBox, matrixAttr, tableMatrix, type SceneFace } from './scene';
import './view.css';

export interface SceneHighlight {
  line: FoldLine;
  dir: 'valley' | 'mountain';
  /** 0..1, default 1. */
  opacity?: number;
}

export interface SceneMarker {
  /** World (desk) position. */
  at: Vec3;
  label: string;
  kind: 'cg' | 'np';
}

export interface SceneInput {
  faces: readonly SceneFace[];
  paper: PaperSpec;
  yaw: number;
  pitch: number;
  /** Unit-scale screen bounds to fit (see screenBounds). */
  fit: ScreenBounds;
  /** Largest scale allowed, user units per metre. */
  maxScale?: number;
  creases?: readonly Crease[] | null;
  shadows?: boolean;
  groundZ?: number;
  /** Fold line drawn on top, in table coordinates at height `overlayZ`. */
  highlight?: SceneHighlight | null;
  /** Table height of the overlay layer and of pointer hit-testing. */
  overlayZ?: number;
  ghost?: readonly SceneFace[] | null;
  markers?: readonly SceneMarker[];
}

export interface SceneHandle {
  draw(input: SceneInput): void;
  /** Client point to table coordinates at the overlay height, using the last drawn camera. */
  toTable(clientX: number, clientY: number): Vec2 | null;
  camera(): Camera | null;
}

export interface SceneViewProps {
  ref?: Ref<SceneHandle>;
  /** Width / height of the box when its CSS does not fix a height. */
  aspect: number;
  /** Free margin around the fitted content, px. */
  pad?: number;
  /** Rough px per metre, for the print line weight floor. */
  printScale?: number;
  label: string;
  className?: string;
  style?: CSSProperties;
  /** Table-frame overlay children (metres, y up). */
  children?: ReactNode;
  svgProps?: Omit<SVGProps<SVGSVGElement>, 'ref' | 'children' | 'viewBox'>;
  onResize?: () => void;
}

const DASH: Record<SceneHighlight['dir'], string> = { valley: '7 5', mountain: '9 4 2 4' };

/** The SVG stage every paper view draws into. Drawing is imperative (see FaceRenderer); React renders only the frame. */
export function SceneView({ ref, aspect, pad = 12, printScale = 1500, label, className, style, children, svgProps, onResize }: SceneViewProps): ReactElement {
  const prefix = useId().replace(/[:«»]/g, '');
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const shadowRef = useRef<SVGGElement>(null);
  const facesRef = useRef<SVGGElement>(null);
  const ghostRef = useRef<SVGGElement>(null);
  const overlayRef = useRef<SVGGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const markerRef = useRef<SVGGElement>(null);
  const renderers = useRef<{ main: FaceRenderer; ghost: FaceRenderer } | null>(null);
  const last = useRef<SceneInput | null>(null);
  const camRef = useRef<Camera | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 360, h: 360 / aspect });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const draw = useCallback(
    (input: SceneInput): void => {
      last.current = input;
      if (!renderers.current) {
        if (!facesRef.current || !ghostRef.current) return;
        renderers.current = { main: new FaceRenderer(facesRef.current, shadowRef.current), ghost: new FaceRenderer(ghostRef.current, null) };
      }
      const { w, h } = sizeRef.current;
      const cam = fitBounds(input.fit, input.yaw, input.pitch, { width: w, height: h, pad }, input.maxScale);
      camRef.current = cam;
      const paint = { paper: input.paper, patternPrefix: prefix, creases: input.creases ?? null };
      renderers.current.main.draw(composeScene(input.faces, cam, { shadows: input.shadows ?? true, groundZ: input.groundZ }), paint);
      if (input.ghost && input.ghost.length) {
        renderers.current.ghost.draw(composeScene(input.ghost, cam), { ...paint, creases: null });
      } else {
        renderers.current.ghost.clear();
      }
      const z = input.overlayZ ?? 0;
      overlayRef.current?.setAttribute('transform', matrixAttr(tableMatrix(cam, z)));
      const line = lineRef.current;
      if (line) {
        const b = input.highlight ? facesBounds(input.faces) : null;
        const seg = input.highlight && b ? lineInBox(input.highlight.line, b.min, b.max, 0.006) : null;
        if (input.highlight && seg) {
          const basis = cameraBasis(cam.yaw, cam.pitch);
          const p = projectWith(basis, cam, [seg[0][0], seg[0][1], b!.topZ]);
          const q = projectWith(basis, cam, [seg[1][0], seg[1][1], b!.topZ]);
          line.setAttribute('d', `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
          line.setAttribute('stroke-dasharray', DASH[input.highlight.dir]);
          line.setAttribute('class', `ppl-scene__fold ppl-scene__fold--${input.highlight.dir}`);
          line.style.opacity = String(input.highlight.opacity ?? 1);
          line.style.display = '';
        } else {
          line.style.display = 'none';
        }
      }
      const mg = markerRef.current;
      if (mg) {
        const basis = cameraBasis(cam.yaw, cam.pitch);
        const markers = input.markers ?? [];
        while (mg.childNodes.length > markers.length) mg.lastChild?.remove();
        markers.forEach((m, i) => {
          let g = mg.childNodes[i] as SVGGElement | undefined;
          if (!g) {
            g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            mg.appendChild(g);
          }
          const p = projectWith(basis, cam, m.at);
          g.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
          const key = `${m.kind}|${m.label}`;
          if (g.dataset.key !== key) {
            g.dataset.key = key;
            g.setAttribute('class', `ppl-marker ppl-marker--${m.kind}`);
            g.innerHTML =
              m.kind === 'cg'
                ? '<circle r="6.5" class="ppl-marker__ring"/><path d="M0 0V-6.5A6.5 6.5 0 0 1 6.5 0ZM0 0V6.5A6.5 6.5 0 0 1 -6.5 0Z" class="ppl-marker__fill"/>'
                : '<path d="M0 -7L7 0L0 7L-7 0Z" class="ppl-marker__ring"/><circle r="2" class="ppl-marker__fill"/>';
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t.setAttribute('class', 'ppl-marker__label');
            t.setAttribute('y', m.kind === 'cg' ? '-11' : '18');
            t.setAttribute('text-anchor', 'middle');
            t.textContent = m.label;
            g.appendChild(t);
          }
        });
      }
    },
    [pad, prefix],
  );

  useImperativeHandle(
    ref,
    () => ({
      draw,
      camera: () => camRef.current,
      toTable(clientX: number, clientY: number): Vec2 | null {
        const svg = svgRef.current;
        const cam = camRef.current;
        if (!svg || !cam) return null;
        const r = svg.getBoundingClientRect();
        const { w, h } = sizeRef.current;
        const sx = ((clientX - r.left) / Math.max(r.width, 1)) * w;
        const sy = ((clientY - r.top) / Math.max(r.height, 1)) * h;
        const p = unprojectToPlane(cam, sx, sy, last.current?.overlayZ ?? 0);
        return p ? [p[0], p[1]] : null;
      },
    }),
    [draw],
  );

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = (): void => {
      const r = box.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const next = { w: Math.round(r.width), h: Math.round(r.height) };
      if (next.w === sizeRef.current.w && next.h === sizeRef.current.h) return;
      sizeRef.current = next;
      setSize(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  // Redraw at the new size: the owner recomputes its scene, or the last scene is reused.
  useEffect(() => {
    if (onResizeRef.current) onResizeRef.current();
    else if (last.current) draw(last.current);
  }, [size, draw]);

  return (
    <div ref={boxRef} className={cx('ppl-scene', className)} style={{ aspectRatio: String(aspect), ...style }}>
      <svg ref={svgRef} className="ppl-scene__svg" viewBox={`0 0 ${size.w} ${size.h}`} width={size.w} height={size.h} role="img" aria-label={label} {...svgProps}>
        <PaperPatternDefs idPrefix={prefix} unitsPerMetre={1} minLine={0.6 / printScale} />
        <defs>
          <filter id={`${prefix}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        <g ref={shadowRef} className="ppl-scene__shadow" filter={`url(#${prefix}-soft)`} />
        <g ref={facesRef} className="ppl-scene__faces" />
        <g ref={ghostRef} className="ppl-scene__ghost" />
        <path ref={lineRef} className="ppl-scene__fold" style={{ display: 'none' }} />
        <g ref={overlayRef} className="ppl-scene__overlay">
          {children}
        </g>
        <g ref={markerRef} className="ppl-scene__markers" />
      </svg>
    </div>
  );
}
