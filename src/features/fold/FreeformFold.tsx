import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement } from 'react';
import { foldFlat, isSymmetric, snapPoints, tableBounds } from '../../core/fold';
import type { FoldIssue, FoldLine, FoldStep, PlaneDesign, Vec2 } from '../../core/types';
import { Button, IconButton } from '../../ui/Button';
import { Chip, Tag } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import { InfoDot } from '../../ui/InfoDot';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { toast } from '../../ui/Toast';
import { PaperCanvas } from './view';
import { dist, lineStep, maxLayers, movedPieces, nearest, pointToPointStep, snapAngle, trySteps, withMirrorStep, type Trial } from './geometry';
import './fold.css';

export interface FreeformFoldProps {
  design: PlaneDesign;
  /** Commit a new list of flat steps (one undo entry). */
  onSteps: (steps: FoldStep[]) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Go on to shaping; offered only while the model is symmetric. */
  onContinue: () => void;
}

type Tool = 'drag' | 'line';
/** Snap radius on screen, px. */
const SNAP_PX = 28;
/** Drags shorter than this do nothing, metres. */
const MIN_DRAG = 0.002;

/** Plain-words version of a fold problem. */
export function issueText(issue: FoldIssue): string {
  switch (issue.code) {
    case 'line-misses-paper':
      return 'That fold line misses the paper. Start and end on the model.';
    case 'degenerate-line':
      return 'Pick two different points.';
    case 'nothing-moves':
      return 'Nothing would fold there: all of the paper is on one side of the line.';
    case 'too-many-layers':
      return 'That is more layers than paper can take. Undo a fold or two, then try again.';
    case 'flap-blocked':
      return 'Some layers lying on top of that flap had to come along too.';
    case 'not-symmetric':
      return 'The model is no longer the same on both sides.';
    case 'shape-line-invalid':
      return 'That shaping line does not fit the model.';
    case 'sliver':
      return 'The fold clipped a tiny corner.';
  }
}

interface DragState {
  id: number;
  from: Vec2;
  to: Vec2;
  snap: 'point' | 'angle' | null;
}

interface LineState {
  a: Vec2 | null;
  b: Vec2 | null;
  /** Pointer position while choosing the side. */
  side: Vec2 | null;
}

/** Freeform folding on a top-down sheet: drag a point onto another, or fold along a line you draw. */
export function FreeformFold({ design, onSteps, canUndo, canRedo, onUndo, onRedo, onContinue }: FreeformFoldProps): ReactElement {
  const { paper, steps } = design;
  const cx0 = paper.width / 2;
  const flat = useMemo(() => foldFlat(paper, steps).final, [paper, steps]);
  const snaps = useMemo(() => snapPoints(flat), [flat]);
  const symmetric = useMemo(() => isSymmetric(flat), [flat]);
  const layers = useMemo(() => maxLayers(flat), [flat]);

  const [tool, setTool] = useState<Tool>('drag');
  const [dir, setDir] = useState<'valley' | 'mountain'>('valley');
  const [layerMode, setLayerMode] = useState<'all' | 'flap'>('all');
  const [mirror, setMirror] = useState(true);
  const [creaseOnly, setCreaseOnly] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [line, setLine] = useState<LineState>({ a: null, b: null, side: null });
  const [hint, setHint] = useState<string | null>(null);
  const px = useRef(1500);
  const opts = { dir, layers: layerMode, creaseOnly };

  useEffect(() => {
    setLine({ a: null, b: null, side: null });
    setDrag(null);
  }, [tool, steps]);

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      e.preventDefault();
      if (e.shiftKey) onRedo();
      else onUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndo, onRedo]);

  const trialFor = (step: FoldStep | null): { steps: FoldStep[]; trial: Trial } | null => {
    if (!step) return null;
    const list = withMirrorStep(step, mirror, cx0);
    return { steps: list, trial: trySteps(flat, list, steps.length) };
  };

  const dragStep: FoldStep | null = drag && dist(drag.from, drag.to) >= MIN_DRAG ? pointToPointStep(drag.from, drag.to, opts) : null;
  const lineFold: FoldLine | null = line.a && line.b && dist(line.a, line.b) >= MIN_DRAG ? { a: line.a, b: line.b } : null;
  const lineFoldStep: FoldStep | null = lineFold && (line.side || creaseOnly) ? lineStep(lineFold, line.side ?? lineFold.a, opts) : null;
  // Recomputed per pointer move; a fold step applies in well under a millisecond on typical models.
  const preview = trialFor(tool === 'drag' ? dragStep : lineFoldStep);

  const commit = (p: { steps: FoldStep[]; trial: Trial } | null): void => {
    if (!p) return;
    const err = p.trial.issues.find((i) => i.severity === 'error');
    if (err) {
      toast({ title: 'That fold will not work', body: issueText(err), tone: 'warning' });
      return;
    }
    const warn = p.trial.issues.find((i) => i.code === 'flap-blocked');
    if (warn) toast({ title: 'Heads up', body: issueText(warn), tone: 'info' });
    onSteps([...steps, ...p.steps]);
  };

  const radius = (): number => SNAP_PX / px.current;

  const snapTo = (p: Vec2, from: Vec2 | null): { p: Vec2; snap: DragState['snap'] } => {
    const others = from ? snaps.filter((q) => dist(q, from) > 1e-6) : snaps;
    const hit = nearest(others, p, radius());
    if (hit) return { p: hit, snap: 'point' };
    if (from) {
      const a = snapAngle(from, p);
      if (a.snapped) return { p: a.p, snap: 'angle' };
    }
    return { p, snap: null };
  };

  const onDown = (p: Vec2, e: PointerEvent<SVGSVGElement>): void => {
    setHint(null);
    if (tool === 'drag') {
      const start = nearest(snaps, p, radius() * 1.3);
      if (!start) {
        setHint('Start a fold on one of the dots: a corner, the middle of an edge or the end of a crease.');
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ id: e.pointerId, from: start, to: start, snap: null });
      return;
    }
    if (!line.a) {
      setLine({ a: snapTo(p, null).p, b: null, side: null });
    } else if (!line.b) {
      const b = snapTo(p, line.a).p;
      if (dist(b, line.a) < MIN_DRAG) return;
      if (creaseOnly) {
        commit(trialFor(lineStep({ a: line.a, b }, b, opts)));
        setLine({ a: null, b: null, side: null });
      } else setLine({ a: line.a, b, side: null });
    } else {
      const lf: FoldLine = { a: line.a, b: line.b };
      commit(trialFor(lineStep(lf, p, opts)));
      setLine({ a: null, b: null, side: null });
    }
  };

  const onMove = (p: Vec2, e: PointerEvent<SVGSVGElement>): void => {
    if (tool === 'drag') {
      if (!drag || drag.id !== e.pointerId) return;
      const s = snapTo(p, drag.from);
      setDrag({ ...drag, to: s.p, snap: s.snap });
    } else if (line.a && line.b) {
      setLine({ ...line, side: p });
    }
  };

  const onUp = (_p: Vec2, e: PointerEvent<SVGSVGElement>): void => {
    if (tool !== 'drag' || !drag || drag.id !== e.pointerId) return;
    if (dragStep) commit(preview);
    setDrag(null);
  };

  const bounds = useMemo(() => {
    const b = tableBounds(flat);
    const m = 0.04 * Math.max(paper.width, paper.height);
    return {
      min: [Math.min(0, b.min[0]) - m, Math.min(0, b.min[1]) - m] as Vec2,
      max: [Math.max(paper.width, b.max[0]) + m, Math.max(paper.height, b.max[1]) + m] as Vec2,
    };
  }, [flat, paper.width, paper.height]);
  const aspect = (bounds.max[0] - bounds.min[0]) / (bounds.max[1] - bounds.min[1]);

  const ok = preview?.trial.ok ?? true;
  const firstStep = preview?.steps[0];
  const highlightLine = firstStep && firstStep.kind !== 'flip' ? firstStep.line : lineFold;
  const showDots = drag !== null || tool === 'line';
  const lineHint = !line.a
    ? 'Tap the first point of the crease.'
    : !line.b
      ? 'Tap the second point.'
      : 'Now tap the side that should fold over.';

  return (
    <div className="ppl-free">
      <div className="ppl-free__stagewrap">
        <div className="ppl-free__stage" style={{ '--ppl-aspect': aspect.toFixed(3) } as CSSProperties} onPointerCancel={() => setDrag(null)}>
          <PaperCanvas
            paper={paper}
            state={flat}
            tilt={0}
            fitTo={bounds}
            aspect={aspect}
            shadows={false}
            ghost={preview?.trial.ok && !creaseOnly ? movedPieces(preview.trial, 0.0006) : null}
            highlight={highlightLine ? { line: highlightLine, dir: creaseOnly ? 'valley' : dir } : null}
            label="Your sheet, seen from above. Drag a dot onto another point to fold."
            className={cx('ppl-desk', !ok && 'ppl-free--bad')}
            onTablePointerDown={onDown}
            onTablePointerMove={onMove}
            onTablePointerUp={onUp}
          >
            {({ pxPerMetre }) => {
              px.current = pxPerMetre;
              const r = (n: number): number => n / pxPerMetre;
              return (
                <g className="ppl-free__marks">
                  {snaps.map((q, i) => (
                    <circle key={i} cx={q[0]} cy={q[1]} r={r(showDots ? 4 : 2.5)} className={cx('ppl-free__dot', showDots && 'is-live')} />
                  ))}
                  {drag && (
                    <>
                      <line x1={drag.from[0]} y1={drag.from[1]} x2={drag.to[0]} y2={drag.to[1]} className="ppl-free__path" vectorEffect="non-scaling-stroke" />
                      <circle cx={drag.from[0]} cy={drag.from[1]} r={r(7)} className="ppl-free__from" />
                      <circle
                        cx={drag.to[0]}
                        cy={drag.to[1]}
                        r={r(drag.snap === 'point' ? 12 : 9)}
                        className={cx('ppl-free__to', drag.snap && `is-snap-${drag.snap}`, !ok && 'is-bad')}
                        vectorEffect="non-scaling-stroke"
                      />
                    </>
                  )}
                  {tool === 'line' &&
                    [line.a, line.b].map((q, i) => q && <circle key={i} cx={q[0]} cy={q[1]} r={r(7)} className="ppl-free__from" />)}
                  {tool === 'line' && line.side && line.b && <circle cx={line.side[0]} cy={line.side[1]} r={r(8)} className="ppl-free__side" vectorEffect="non-scaling-stroke" />}
                </g>
              );
            }}
          </PaperCanvas>
        </div>
        <p className="ppl-free__hint" aria-live="polite">
          {hint ??
            (tool === 'line'
              ? lineHint
              : drag
                ? drag.snap === 'point'
                  ? 'Snapped to a point. Let go to fold.'
                  : drag.snap === 'angle'
                    ? 'Snapped to a neat angle. Let go to fold.'
                    : 'Let go to fold. The dashed line is the crease.'
                : steps.length === 0
                  ? 'Drag a corner or any dot onto another point. The fold line lands halfway between them.'
                  : 'Drag another dot to keep folding.')}
        </p>
        <div className="ppl-free__toolbar" role="toolbar" aria-label="Folding tools">
          <IconButton icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
          <IconButton icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />
          <IconButton icon="flip" label="Turn the paper over" onClick={() => onSteps([...steps, { kind: 'flip' }])} />
          <IconButton icon="trash" label="Start over with a flat sheet" onClick={() => steps.length && onSteps([])} disabled={steps.length === 0} />
          <span className="ppl-free__spacer" />
          <Chip selected={mirror} icon="mirror" onClick={() => setMirror((m) => !m)}>
            Mirror
          </Chip>
          <Chip selected={creaseOnly} icon="crease" onClick={() => setCreaseOnly((c) => !c)}>
            Crease
          </Chip>
          <InfoDot label="Mirror and crease" title="Mirror and crease">
            Mirror repeats every fold on the other half, so the plane stays balanced. Crease folds and unfolds, leaving a guide line and
            snap points without changing the shape.
          </InfoDot>
        </div>
      </div>

      <div className="ppl-free__panel">
        <SegmentedControl<Tool>
          label="Folding tool"
          block
          value={tool}
          onChange={setTool}
          options={[
            { value: 'drag', label: 'Point to point', icon: 'hand' },
            { value: 'line', label: 'Along a line', icon: 'ruler' },
          ]}
        />
        <div className="ppl-free__row">
          <SegmentedControl<'valley' | 'mountain'>
            label="Fold direction"
            size="sm"
            value={dir}
            onChange={setDir}
            options={[
              { value: 'valley', label: 'Valley', icon: 'valley' },
              { value: 'mountain', label: 'Mountain', icon: 'mountain' },
            ]}
          />
          <SegmentedControl<'all' | 'flap'>
            label="Layers that move"
            size="sm"
            value={layerMode}
            onChange={setLayerMode}
            options={[
              { value: 'all', label: 'All layers' },
              { value: 'flap', label: 'Top flap' },
            ]}
          />
          <InfoDot label="What do these mean?" title="Valley, mountain and flaps">
            A valley fold brings the paper toward you and lands it on top; a mountain fold tucks it away underneath. "Top flap" moves only
            the uppermost loose flap instead of every layer on that side.
          </InfoDot>
        </div>

        <div className="ppl-free__readout">
          <span className="ppl-num">
            {steps.length} {steps.length === 1 ? 'step' : 'steps'} · {layers} {layers === 1 ? 'layer' : 'layers'} at the thickest
          </span>
          <Tag tone={symmetric ? 'good' : 'warn'} icon={symmetric ? 'check' : 'warning'}>
            {symmetric ? 'Symmetric' : 'Not symmetric'}
          </Tag>
          <InfoDot label="Why symmetry?" title="Both halves must match">
            The plane is folded in half along the centre line, so the left and right halves have to match. Turn Mirror on, or fold the
            other side the same way. More layers near the nose move the balance point forward.
          </InfoDot>
        </div>
        <Button variant="primary" block icon="next" onClick={onContinue} disabled={!symmetric}>
          {symmetric ? 'Shape the plane' : 'Make it symmetric to go on'}
        </Button>
      </div>
    </div>
  );
}
