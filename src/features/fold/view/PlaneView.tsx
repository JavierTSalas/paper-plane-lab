import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import type { PaperSpec, PosedModel, Vec3 } from '../../../core/types';
import { cx } from '../../../ui/cx';
import { cameraBasis, screenBounds, type ScreenBounds } from './projector';
import { bodyToDesk, facesFromModel, type SceneFace } from './scene';
import { SceneView, type SceneHandle, type SceneMarker } from './SceneView';
import { THREE_QUARTER_VIEW } from './timeline';

export interface PlaneMarker {
  /** Body x, metres from the tail. */
  x: number;
  kind: 'cg' | 'np';
  /** Default "CG" / "NP". */
  label?: string;
}

export interface PlaneViewProps {
  model: PosedModel;
  /** Paper colours and print. Default: model.paper. */
  paper?: PaperSpec;
  /** Camera turn about the vertical, degrees. 0 looks from behind the tail; 90 from the right; 180 from the nose. */
  yaw?: number;
  /** Camera elevation, degrees. 90 = straight down. */
  pitch?: number;
  /** Drag (or arrow keys) to orbit. The yaw / pitch props then set the starting view. */
  interactive?: boolean;
  onOrbit?: (yaw: number, pitch: number) => void;
  markers?: readonly PlaneMarker[];
  /** Soft shadow on a ground plane a little below the keel. Default true. */
  groundShadow?: boolean;
  /** Width in px; height follows `aspect`. Default: fill the container width. */
  size?: number;
  /** Width / height. Default 4 / 3. */
  aspect?: number;
  /** Desk-like backdrop behind the plane. Default false. */
  backdrop?: boolean;
  label?: string;
  className?: string;
}

/** Height of the wing root on the plane of symmetry, for markers: the top of the fuselage, else 0. */
function rootHeight(model: PosedModel): number {
  let y = -Infinity;
  for (const p of model.pieces) {
    const role = model.panels[p.panel]?.role;
    if (role !== 'fuselage' && role !== 'center') continue;
    for (const v of p.verts) y = Math.max(y, v[1]);
  }
  return Number.isFinite(y) ? y : 0;
}

/** Bounds of a sphere around the model: the framing stays put while the camera orbits. */
function sphereFit(points: readonly Vec3[], yaw: number, pitch: number): ScreenBounds {
  const lo: number[] = [Infinity, Infinity, Infinity];
  const hi: number[] = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k]!, p[k])), (hi[k] = Math.max(hi[k]!, p[k]));
  const c: Vec3 = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
  let r = 0;
  for (const p of points) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
  const { r: right, u } = cameraBasis(yaw, pitch);
  const sx = c[0] * right[0] + c[1] * right[1] + c[2] * right[2];
  const sy = -(c[0] * u[0] + c[1] * u[1] + c[2] * u[2]);
  return { min: [sx - r, sy - r], max: [sx + r, sy + r] };
}

/** A posed paper plane in 3D, painter-sorted and shaded. */
export function PlaneView({
  model,
  paper,
  yaw = THREE_QUARTER_VIEW.yaw,
  pitch = THREE_QUARTER_VIEW.pitch,
  interactive = false,
  onOrbit,
  markers,
  groundShadow = true,
  size,
  aspect = 4 / 3,
  backdrop = false,
  label,
  className,
}: PlaneViewProps): ReactElement {
  const scene = useRef<SceneHandle>(null);
  const view = useRef({ yaw, pitch });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  const faces: SceneFace[] = useMemo(() => facesFromModel(model, { gap: 0.0004 }), [model]);
  const points = useMemo(() => faces.flatMap((f) => f.verts), [faces]);
  const deskMarkers: SceneMarker[] = useMemo(() => {
    const h = rootHeight(model);
    return (markers ?? []).map((m) => ({ at: bodyToDesk([m.x, h, 0]), kind: m.kind, label: m.label ?? (m.kind === 'cg' ? 'CG' : 'NP') }));
  }, [markers, model]);
  const groundZ = -0.12 * Math.max(model.length, model.span);

  const draw = useCallback((): void => {
    const { yaw: y, pitch: p } = view.current;
    scene.current?.draw({
      faces,
      paper: paper ?? model.paper,
      yaw: y,
      pitch: p,
      fit: interactive ? sphereFit(points, y, p) : (screenBounds(points, y, p) ?? sphereFit(points, y, p)),
      shadows: groundShadow,
      groundZ,
      markers: deskMarkers,
    });
  }, [faces, points, paper, model.paper, interactive, groundShadow, groundZ, deskMarkers]);

  // Controlled view (or a new starting view).
  useEffect(() => {
    view.current = { yaw, pitch };
    draw();
  }, [yaw, pitch, draw]);
  useLayoutEffect(draw, [draw]);

  const orbit = (dYaw: number, dPitch: number): void => {
    const v = view.current;
    view.current = { yaw: v.yaw + dYaw, pitch: Math.max(-5, Math.min(89, v.pitch + dPitch)) };
    draw();
    onOrbit?.(view.current.yaw, view.current.pitch);
  };

  const svgProps = interactive
    ? {
        tabIndex: 0,
        onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          orbit(-(e.clientX - d.x) * 0.45, (e.clientY - d.y) * 0.35);
          d.x = e.clientX;
          d.y = e.clientY;
        },
        onPointerUp: () => (drag.current = null),
        onPointerCancel: () => (drag.current = null),
        onKeyDown: (e: KeyboardEvent<SVGSVGElement>) => {
          const step: Record<string, [number, number]> = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] };
          const s = step[e.key];
          if (!s) return;
          e.preventDefault();
          orbit(s[0], s[1]);
        },
      }
    : undefined;

  return (
    <SceneView
      ref={scene}
      aspect={aspect}
      pad={markers?.length ? 22 : 10}
      label={label ?? `${interactive ? 'Drag to turn. ' : ''}Folded plane, ${Math.round(model.length * 1000)} mm long`}
      className={cx('ppl-planeview', interactive && 'ppl-planeview--orbit', backdrop && 'ppl-desk', className)}
      style={size ? { width: size, maxWidth: '100%' } : undefined}
      onResize={draw}
      svgProps={svgProps}
    />
  );
}
