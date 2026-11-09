/**
 * Side silhouette of a posed plane for the tunnel view. The body frame is +x nose, +y up, +z right wing; the
 * tunnel shows the plane nose-left (facing the wind, which blows to the right), so the viewer looks from the
 * plane's LEFT side (-z) and the right-hand pieces are farthest away.
 */
import type { PosedModel, Vec3 } from '../../core/types';
import type { Pt } from './flow';

export interface SidePiece {
  id: number;
  /** Picture frame: CG at the origin, y up, units of plane length, nose to the left, rotated nose-up by alpha. */
  points: Pt[];
  fill: string;
  /** Pieces on the far side of the plane of symmetry are drawn shaded. */
  far: boolean;
}

/** Body-frame point -> picture frame (see SidePiece.points). */
export function bodyToPicture(p: readonly [number, number], cg: Vec3, length: number, alphaRad: number): Pt {
  const x = -(p[0] - cg[0]) / length;
  const y = (p[1] - cg[1]) / length;
  const c = Math.cos(alphaRad);
  const s = Math.sin(alphaRad);
  return [x * c + y * s, -x * s + y * c];
}

export function sideSilhouette(model: PosedModel, cg: Vec3, alphaRad: number): SidePiece[] {
  const length = model.length || 1;
  const pieces = model.pieces.map((piece) => {
    let z = 0;
    for (const v of piece.verts) z += v[2];
    z /= piece.verts.length || 1;
    // The viewer looks along +z; the front face shows when its normal points back at the viewer (-z).
    const frontShows = piece.frontNormal[2] < 0;
    return {
      id: piece.id,
      depth: z * 1000 - piece.layer * 1e-6,
      points: piece.verts.map((v) => bodyToPicture([v[0], v[1]], cg, length, alphaRad)),
      fill: frontShows ? model.paper.front : model.paper.back,
      far: z > 1e-4,
    };
  });
  // Painter's order: farthest (largest z) first.
  pieces.sort((a, b) => b.depth - a.depth);
  return pieces.map(({ id, points, fill, far }) => ({ id, points, fill, far }));
}
