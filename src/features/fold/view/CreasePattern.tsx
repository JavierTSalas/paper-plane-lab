import { useId, useMemo, type ReactElement } from 'react';
import type { Crease, FlatState, FoldLine, PlaneDesign, ShapeSpec, Vec2 } from '../../../core/types';
import { cx } from '../../../ui/cx';
import { finalHingeAngles } from '../../../core/fold';
import { PaperPatternDefs, paperFaceFill } from '../../../ui/paper';
import { cachedPlane } from './PlaneThumb';
import { clipSegment, isoInverse } from './scene';
import './view.css';

export interface CreasePatternProps {
  design: PlaneDesign;
  /** Also draw the shaping folds (centre fold, wing and winglet lines). Default true. */
  includeShape?: boolean;
  /** Tiny legend under the sheet. Default true. */
  legend?: boolean;
  /** Largest width in px. Default: fill the container. */
  size?: number;
  className?: string;
}

type Assignment = Crease['assignment'];
const flipAssignment = (a: Assignment): Assignment => (a === 'valley' ? 'mountain' : a === 'mountain' ? 'valley' : a);

/** A table-frame line mapped onto every layer it crosses, as sheet segments. Assignment is as seen by the viewer of the flat model. */
function lineOnSheet(flat: FlatState, line: FoldLine, viewer: Assignment, step: number): Crease[] {
  const out: Crease[] = [];
  for (const piece of flat.pieces) {
    const a = isoInverse(piece.iso, line.a);
    const b = isoInverse(piece.iso, line.b);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const far = 10;
    const seg = clipSegment([a[0] - dx * far, a[1] - dy * far], [b[0] + dx * far, b[1] + dy * far], piece.sheet);
    if (seg) out.push({ a: seg[0], b: seg[1], assignment: piece.flipped ? flipAssignment(viewer) : viewer, step });
  }
  return out;
}

/** Creases the 3D shaping adds: centre fold, wing lines and winglet lines with both mirrors. */
export function shapeCreases(flat: FlatState, shape: ShapeSpec): Crease[] {
  const cx0 = flat.paper.width / 2;
  const angles = finalHingeAngles(shape);
  const s = shape.keel === 'mountain' ? -1 : 1;
  const pick = (positiveIsMountain: boolean, angle: number): Assignment | null => {
    if (Math.abs(angle) < 1e-9) return null;
    const mountain = angle > 0 === positiveIsMountain;
    return (s === 1) === mountain ? 'mountain' : 'valley';
  };
  const mirror = (l: FoldLine): FoldLine => ({ a: [2 * cx0 - l.a[0], l.a[1]], b: [2 * cx0 - l.b[0], l.b[1]] });
  const out: Crease[] = [];
  if (shape.keel !== 'none') out.push(...lineOnSheet(flat, { a: [cx0, 0], b: [cx0, 1] }, shape.keel === 'valley' ? 'valley' : 'mountain', -1));
  const wing = shape.wingLine ? pick(true, angles.wing) : null;
  if (shape.wingLine && wing) for (const l of [shape.wingLine, mirror(shape.wingLine)]) out.push(...lineOnSheet(flat, l, wing, -1));
  const winglet = shape.wingletLine ? pick(false, angles.winglet) : null;
  if (shape.wingletLine && winglet) for (const l of [shape.wingletLine, mirror(shape.wingletLine)]) out.push(...lineOnSheet(flat, l, winglet, -1));
  return out;
}

const ORDER: Record<Assignment, number> = { aux: 0, mountain: 1, valley: 2 };

/** The unfolded sheet with every crease, Yoshizawa-Randlett style, seen from the front of the paper. */
export function CreasePattern({ design, includeShape = true, legend = true, size, className }: CreasePatternProps): ReactElement {
  const prefix = useId().replace(/[:«»]/g, '');
  const { flat } = cachedPlane(design);
  const { width: W, height: H } = design.paper;
  const creases = useMemo(() => {
    const all = [...flat.creases, ...(includeShape ? shapeCreases(flat, design.shape) : [])];
    return all.sort((a, b) => ORDER[a.assignment] - ORDER[b.assignment]);
  }, [flat, includeShape, design.shape]);
  const mm = 1000;
  const pt = (p: Vec2): string => `${(p[0] * mm).toFixed(2)} ${((H - p[1]) * mm).toFixed(2)}`;
  const front = paperFaceFill(design.paper, 'front', prefix);
  const pad = 4;
  const vw = W * mm + 2 * pad;
  const vh = H * mm + 2 * pad;
  const counts = { valley: 0, mountain: 0, aux: 0 };
  for (const c of creases) counts[c.assignment]++;
  return (
    <figure className={cx('ppl-cp', className)} style={size ? { maxWidth: size } : undefined}>
      <svg className="ppl-cp__svg" viewBox={`${-pad} ${-pad} ${vw} ${vh}`} role="img" aria-label={`Crease pattern of ${design.name}: ${counts.valley} valley, ${counts.mountain} mountain and ${counts.aux} reference creases`}>
        <PaperPatternDefs idPrefix={prefix} unitsPerMetre={mm} />
        <rect x={1.2} y={2.4} width={W * mm} height={H * mm} rx={1} className="ppl-cp__shadow" />
        <rect width={W * mm} height={H * mm} fill={front.base} />
        {front.overlay && <rect width={W * mm} height={H * mm} fill={front.overlay} />}
        {creases.map((c, i) => (
          <path key={i} d={`M${pt(c.a)}L${pt(c.b)}`} className={`ppl-crease ppl-crease--${c.assignment}`} vectorEffect="non-scaling-stroke" />
        ))}
        <rect width={W * mm} height={H * mm} className="ppl-cp__edge" vectorEffect="non-scaling-stroke" />
      </svg>
      {legend && (
        <figcaption className="ppl-cp__legend">
          {(['valley', 'mountain', 'aux'] as const).map((a) => (
            <span key={a} className="ppl-cp__key">
              <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
                <path d="M2 5H26" className={`ppl-crease ppl-crease--${a}`} />
              </svg>
              {a === 'valley' ? 'Valley' : a === 'mountain' ? 'Mountain' : 'Reference'}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
