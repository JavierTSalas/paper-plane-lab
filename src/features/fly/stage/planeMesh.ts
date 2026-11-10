/**
 * The folded plane as one mesh: every posed piece is a double-sided polygon (front and back faces of the
 * paper as two separate one-sided triangle fans, so each face gets its own colour), offset along its
 * panel's stacking direction by its layer so stacked layers do not fight.
 */
import * as THREE from 'three';
import type { PaperSpec, PosedModel } from '../../../core/types';

/** Rendering gap between stacked layers, metres (a little more than real paper, so folds read). */
export const LAYER_GAP = 0.00035;
/** Shade step between neighbouring layers. */
const LAYER_SHADE = 0.06;

export function buildPlaneGeometry(model: PosedModel, paper: PaperSpec): THREE.BufferGeometry {
  const front = new THREE.Color(paper.front);
  const back = new THREE.Color(paper.back);
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (const piece of model.pieces) {
    const panel = model.panels[piece.panel];
    const sd = panel ? panel.stackDir : piece.frontNormal;
    const off = piece.layer * LAYER_GAP;
    const verts = piece.verts.map((v) => new THREE.Vector3(v[0] + sd[0] * off, v[1] + sd[1] * off, v[2] + sd[2] * off));
    if (verts.length < 3) continue;
    const fn = new THREE.Vector3(piece.frontNormal[0], piece.frontNormal[1], piece.frontNormal[2]);
    // Layers alternate a touch lighter and darker so the edges of folded flaps show.
    const shade = 1 - LAYER_SHADE * (piece.layer % 3);
    for (const side of [1, -1] as const) {
      c.copy(side === 1 ? front : back).multiplyScalar(shade);
      for (let i = 1; i + 1 < verts.length; i++) {
        a.copy(verts[0]);
        b.copy(verts[i]);
        d.copy(verts[i + 1]);
        e1.subVectors(b, a);
        e2.subVectors(d, a);
        n.crossVectors(e1, e2);
        // Wind each triangle so its geometric normal points out of the face it shows.
        if (n.dot(fn) * side < 0) {
          const t = b.clone();
          b.copy(d);
          d.copy(t);
        }
        // Lift each face by a hair along its own normal, so front and back never share a depth.
        const lift = 0.00004 * side;
        for (const p of [a, b, d]) {
          pos.push(p.x + fn.x * lift, p.y + fn.y * lift, p.z + fn.z * lift);
          nor.push(fn.x * side, fn.y * side, fn.z * side);
          col.push(c.r, c.g, c.b);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Soft round shadow: a disc whose vertex alpha falls from the centre to the rim. No texture. */
export function buildBlobGeometry(segments = 24): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const ringR = [0, 0.45, 1];
  const ringA = [0.42, 0.26, 0];
  for (let r = 0; r + 1 < ringR.length; r++) {
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;
      const quadPts: [number, number, number][] = [
        [ringR[r] * Math.cos(t0), ringR[r] * Math.sin(t0), ringA[r]],
        [ringR[r + 1] * Math.cos(t0), ringR[r + 1] * Math.sin(t0), ringA[r + 1]],
        [ringR[r + 1] * Math.cos(t1), ringR[r + 1] * Math.sin(t1), ringA[r + 1]],
        [ringR[r] * Math.cos(t1), ringR[r] * Math.sin(t1), ringA[r]],
      ];
      // Triangles facing +y: (x, z) = (cos, -sin) keeps them counter-clockwise from above.
      for (const k of [0, 2, 1, 0, 3, 2]) {
        const [x, z, al] = quadPts[k];
        pos.push(x, 0, z);
        col.push(0.18, 0.15, 0.1, al);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  return g;
}
