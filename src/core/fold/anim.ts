import { clamp, lerp, norm3, rotateAboutAxis } from '../math';
import { piecePolygon, stackAfterFold } from './flat';
import type { FlatPiece, StepFrame, Vec2, Vec3 } from '../types';

/** One piece of a step at some instant of its animation. */
export interface AnimPiece {
  id: number;
  /** Table x, table y and height z, metres. Vertex i belongs to `sheet[i]`. */
  verts: Vec3[];
  /** Sheet polygon, for colour and pattern lookup. */
  sheet: Vec2[];
  /** The front face of the paper is the one seen from +z. */
  frontUp: boolean;
  moving: boolean;
}

interface Swing {
  origin: Vec3;
  axis: Vec3;
  angle: number;
}

function pose(piece: FlatPiece, swing: Swing | null, height: number, pastEdgeOn: boolean): AnimPiece {
  const verts = piecePolygon(piece).map(([x, y]): Vec3 => {
    const p: Vec3 = swing ? rotateAboutAxis([x, y, 0], swing.origin, swing.axis, swing.angle) : [x, y, 0];
    return [p[0], p[1], p[2] + height];
  });
  const turned = swing !== null && pastEdgeOn;
  return { id: piece.id, verts, sheet: piece.sheet, frontUp: piece.flipped === turned, moving: swing !== null };
}

/**
 * Every piece of a step at progress t (0 = before, 1 = after), as 3D polygons above the table.
 * Moving pieces swing about the fold axis by `sense * pi * t`, so a valley fold passes through +z.
 * A flip turns the whole model about the centreline. Each piece is then lifted by its layer,
 * blended from the layer it had to the layer it gets, times `layerGap`.
 * Crease steps animate the fold only: play t from 0 to 1 and back.
 */
export function frameAt(frame: StepFrame, t: number, layerGap: number): AnimPiece[] {
  const u = clamp(t, 0, 1);
  if (frame.step.kind === 'flip') {
    const pieces = frame.before.pieces;
    const top = pieces.length - 1;
    const swing: Swing = { origin: [frame.before.paper.width / 2, 0, 0], axis: [0, 1, 0], angle: Math.PI * u };
    return pieces.map((p) => pose(p, swing, lerp(p.layer, top - p.layer, u) * layerGap, u > 0.5));
  }
  const moving = new Set(frame.movingIds);
  const layerAfter = new Map(stackAfterFold(frame.split, moving, frame.sense).map((p, layer) => [p.id, layer]));
  const { axis } = frame;
  const swing: Swing | null = axis && {
    origin: [axis.a[0], axis.a[1], 0],
    axis: norm3([axis.b[0] - axis.a[0], axis.b[1] - axis.a[1], 0]),
    angle: frame.sense * Math.PI * u,
  };
  return frame.split.map((p) =>
    pose(p, moving.has(p.id) ? swing : null, lerp(p.layer, layerAfter.get(p.id) ?? p.layer, u) * layerGap, u > 0.5),
  );
}
