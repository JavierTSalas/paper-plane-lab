import type { Crease, PaperSpec, Vec2 } from '../../../core/types';
import { paperFaceFill } from '../../../ui/paper';
import { creasePathOn, matrixAttr, polyPath, shadeColor, type DrawFace } from './scene';

const NS = 'http://www.w3.org/2000/svg';

interface FaceNode {
  g: SVGGElement;
  base: SVGPathElement;
  overlay: SVGPathElement;
  crease: SVGPathElement;
  shadow: SVGPathElement;
  sheet: readonly Vec2[] | null;
  d: string;
  creaseD: string;
  transform: string;
  shadowTransform: string;
  fill: string;
  overlayFill: string;
  hidden: boolean;
}

export interface FacePaint {
  paper: PaperSpec;
  /** Pattern id prefix of the PaperPatternDefs in the same SVG. */
  patternPrefix: string;
  creases?: readonly Crease[] | null;
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/**
 * Keeps one SVG node set per face key and updates attributes in place, so an animation frame costs a
 * few attribute writes and, when the painter order changes, a few node moves. Nothing is re-created.
 */
export class FaceRenderer {
  private nodes = new Map<number, FaceNode>();
  private order: number[] = [];

  constructor(
    private readonly faceRoot: SVGGElement,
    private readonly shadowRoot: SVGGElement | null,
  ) {}

  draw(faces: readonly DrawFace[], paint: FacePaint): void {
    const seen = new Set<number>();
    const front = paperFaceFill(paint.paper, 'front', paint.patternPrefix);
    const back = paperFaceFill(paint.paper, 'back', paint.patternPrefix);
    for (const f of faces) {
      seen.add(f.key);
      const node = this.nodes.get(f.key) ?? this.create(f.key);
      if (node.sheet !== f.sheet) {
        node.sheet = f.sheet;
        const d = polyPath(f.sheet);
        if (d !== node.d) {
          node.d = d;
          node.base.setAttribute('d', d);
          node.overlay.setAttribute('d', d);
          node.shadow.setAttribute('d', d);
        }
      }
      const hidden = f.matrix === null;
      if (hidden !== node.hidden) {
        node.hidden = hidden;
        node.g.style.display = hidden ? 'none' : '';
      }
      if (f.matrix) {
        const tr = matrixAttr(f.matrix);
        if (tr !== node.transform) {
          node.transform = tr;
          node.g.setAttribute('transform', tr);
        }
      }
      const face = f.side === 'front' ? front : back;
      const fill = shadeColor(face.base, f.shade);
      if (fill !== node.fill) {
        node.fill = fill;
        node.base.setAttribute('fill', fill);
      }
      const of = face.overlay ?? 'none';
      if (of !== node.overlayFill) {
        node.overlayFill = of;
        node.overlay.setAttribute('fill', of);
        node.overlay.style.display = face.overlay ? '' : 'none';
      }
      const cd = paint.creases && paint.creases.length ? creasePathOn(f.sheet, paint.creases) : '';
      if (cd !== node.creaseD) {
        node.creaseD = cd;
        node.crease.setAttribute('d', cd);
      }
      const st = f.shadow ? matrixAttr(f.shadow) : '';
      if (st !== node.shadowTransform) {
        node.shadowTransform = st;
        if (st) node.shadow.setAttribute('transform', st);
        node.shadow.style.display = st ? '' : 'none';
      }
    }
    for (const [key, node] of this.nodes) {
      if (seen.has(key)) continue;
      node.g.remove();
      node.shadow.remove();
      this.nodes.delete(key);
    }
    const order = faces.map((f) => f.key);
    if (order.length !== this.order.length || order.some((k, i) => k !== this.order[i])) {
      // appendChild moves an existing node; walking the new order rebuilds the painter order in place.
      for (const key of order) this.faceRoot.appendChild(this.nodes.get(key)!.g);
      this.order = order;
    }
  }

  clear(): void {
    for (const node of this.nodes.values()) {
      node.g.remove();
      node.shadow.remove();
    }
    this.nodes.clear();
    this.order = [];
  }

  private create(key: number): FaceNode {
    const g = el('g', { class: 'ppl-face' });
    const base = el('path', { class: 'ppl-face__base', 'vector-effect': 'non-scaling-stroke' });
    const overlay = el('path', { class: 'ppl-face__print' });
    const crease = el('path', { class: 'ppl-face__crease', 'vector-effect': 'non-scaling-stroke', fill: 'none' });
    g.append(base, overlay, crease);
    const shadow = el('path', { class: 'ppl-face__shadow' });
    this.faceRoot.appendChild(g);
    this.shadowRoot?.appendChild(shadow);
    const node: FaceNode = {
      g, base, overlay, crease, shadow, sheet: null, d: '', creaseD: '', transform: '', shadowTransform: '', fill: '', overlayFill: '', hidden: false,
    };
    this.nodes.set(key, node);
    return node;
  }
}
