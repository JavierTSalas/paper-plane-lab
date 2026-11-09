import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement } from 'react';
import { usePlaneBuild } from '../../app/hooks';
import type { PlaneDesign, StepFrame, Vec2 } from '../../core/types';
import { Button, IconButton } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/icons';
import { useReducedMotion } from '../../ui/motion';
import { Sheet } from '../../ui/Sheet';
import { FoldPlayer, PaperCanvas, stepCaption } from './view';
import { dist, progressAlong, stepHandle } from './geometry';
import { useTween, type TweenLeg } from './useTween';
import './fold.css';

export interface GuidedFoldProps {
  /** The plane to fold; its flat steps are done one by one, then it is shaped. */
  design: PlaneDesign;
  /** The player pressed the finish button after the plane was folded and shaped. */
  onComplete: () => void;
  /** Smaller layout for embedding (onboarding). */
  compact?: boolean;
  /** Controlled count of finished flat steps. Uncontrolled when omitted. */
  done?: number;
  onDoneChange?: (done: number) => void;
  /** Label of the finish button. Default "Continue". */
  finishLabel?: string;
}

/** Drag release counts when the corner is this close to its target, screen px. */
const SNAP_PX = 28;
/** A drag must start this close to the pulsing handle, screen px. */
const GRAB_PX = 56;

const centre = (el: Element | null): Vec2 | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};

function finishLegs(frame: StepFrame, from: number): TweenLeg[] {
  const rest = Math.max(0, 1 - from);
  return frame.step.kind === 'crease'
    ? [
        { to: 1, ms: 150 + 750 * rest },
        { to: 1, ms: 180 },
        { to: 0, ms: 650 },
      ]
    : [{ to: 1, ms: 150 + 900 * rest }];
}

/**
 * Guided folding of a design: each step is shown on the desk with its caption. The player drags the
 * pulsing corner to the target dot, or lets the lab fold it. After the flat steps the plane is folded
 * in half and opened, then `onComplete` is offered.
 */
export function GuidedFold({ design, onComplete, compact = false, done: doneProp, onDoneChange, finishLabel = 'Continue' }: GuidedFoldProps): ReactElement {
  const build = usePlaneBuild(design)!;
  const frames = build.fold.frames;
  const count = frames.length;
  const [innerDone, setInnerDone] = useState(0);
  const done = Math.max(0, Math.min(count, doneProp ?? innerDone));
  const doneRef = useRef(done);
  doneRef.current = done;
  const setDone = useCallback(
    (n: number) => {
      setInnerDone(n);
      onDoneChange?.(n);
    },
    [onDoneChange],
  );

  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const setProgress = useCallback((v: number) => {
    tRef.current = v;
    setT(v);
  }, []);
  const tween = useTween(setProgress, reduced);
  const [busy, setBusy] = useState<'idle' | 'drag' | 'anim'>('idle');
  const [playAll, setPlayAll] = useState(false);
  const [shaped, setShaped] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [misses, setMisses] = useState(0);

  const frame = done < count ? frames[done]! : null;
  const handle = useMemo(() => (frame ? stepHandle(frame) : null), [frame]);
  const fromRef = useRef<SVGCircleElement>(null);
  const toRef = useRef<SVGCircleElement>(null);
  const drag = useRef<{ id: number; from: Vec2; to: Vec2 } | null>(null);

  // A new step (or a jump back) starts at rest.
  useEffect(() => {
    tween.stop();
    drag.current = null;
    setProgress(0);
    setBusy('idle');
    setMisses(0);
  }, [done, design, tween, setProgress]);

  const finishStep = useCallback(
    (from: number) => {
      if (!frame) return;
      setBusy('anim');
      const at = doneRef.current;
      tween.run(from, finishLegs(frame, from), () => {
        setProgress(0);
        setBusy('idle');
        setDone(at + 1);
      });
    },
    [frame, tween, setDone, setProgress],
  );

  const showMe = (): void => {
    if (!frame) return;
    setBusy('anim');
    tween.run(0, [{ to: 1, ms: 1100 }, { to: 1, ms: 380 }, { to: 0, ms: 800 }], () => setBusy('idle'));
  };

  // Play all: fold the remaining steps one after another.
  useEffect(() => {
    if (!playAll) return;
    if (!frame) {
      setPlayAll(false);
      return;
    }
    if (busy !== 'idle') return;
    const id = window.setTimeout(() => finishStep(0), reduced ? 120 : 260);
    return () => window.clearTimeout(id);
  }, [playAll, frame, busy, finishStep, reduced]);

  const onDown = (_p: Vec2, e: PointerEvent<SVGSVGElement>): void => {
    if (busy !== 'idle' || !frame || playAll) return;
    if (frame.step.kind === 'flip') {
      finishStep(0);
      return;
    }
    const from = centre(fromRef.current);
    const to = centre(toRef.current);
    if (!handle || !from || !to) return;
    if (dist([e.clientX, e.clientY], from) > GRAB_PX) {
      setMisses((m) => m + 1);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, from, to };
    setBusy('drag');
  };
  const onMove = (_p: Vec2, e: PointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setProgress(Math.max(0, Math.min(1, progressAlong(d.from, d.to, [e.clientX, e.clientY]))));
  };
  const release = (e: { pointerId: number; clientX: number; clientY: number }, cancelled: boolean): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const now = tRef.current;
    if (!cancelled && (dist([e.clientX, e.clientY], d.to) <= SNAP_PX || now >= 0.82)) {
      finishStep(now);
    } else {
      setMisses((m) => m + 1);
      setBusy('anim');
      tween.run(now, [{ to: 0, ms: 280 }], () => setBusy('idle'));
    }
  };

  const restart = (): void => {
    setShaped(false);
    setPlayAll(false);
    setDone(0);
  };

  const flat = frame === null;
  const caption = frame ? stepCaption(frame.step) : '';
  const isFlip = frame?.step.kind === 'flip';
  const { width: W, height: H } = design.paper;
  const fitTo = useMemo(
    () => ({ min: [-0.05 * W, -0.04 * H] as Vec2, max: [1.05 * W, 1.1 * H] as Vec2 }),
    [W, H],
  );
  const aspect = (1.1 * W) / (1.14 * H);
  const atRest = busy === 'idle' && t === 0;
  const hint = isFlip
    ? 'Tap the paper or the button to turn it over.'
    : misses > 1
      ? 'Press on the pulsing corner and slide it onto the dot. Or let the lab fold it for you.'
      : 'Drag the pulsing corner to the dot.';

  return (
    <div className={cx('ppl-guided', compact && 'ppl-guided--compact')}>
      {!flat ? (
        <>
          <div
            className="ppl-guided__stage"
            style={{ width: `min(100%, calc((100dvh - ${compact ? 360 : 330}px) * ${aspect.toFixed(3)}))` }}
            onPointerCancel={(e) => release(e, true)}
          >
            <PaperCanvas
              paper={design.paper}
              frame={frame}
              t={t}
              tilt={22}
              fitTo={fitTo}
              aspect={aspect}
              highlight={frame.axis && atRest ? { line: frame.axis, dir: frame.step.kind === 'fold' && frame.step.dir === 'mountain' ? 'mountain' : 'valley' } : null}
              label={`Step ${done + 1}: ${caption}`}
              className="ppl-desk"
              onTablePointerDown={onDown}
              onTablePointerMove={onMove}
              onTablePointerUp={(_p, e) => release(e, false)}
            >
              {({ pxPerMetre }) =>
                handle &&
                (busy === 'idle' || busy === 'drag') && (
                  <g className="ppl-guided__marks">
                    {atRest && (
                      <line
                        x1={handle.from[0]}
                        y1={handle.from[1]}
                        x2={handle.to[0]}
                        y2={handle.to[1]}
                        className="ppl-guided__path"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <circle ref={toRef} cx={handle.to[0]} cy={handle.to[1]} r={9 / pxPerMetre} className="ppl-guided__target" vectorEffect="non-scaling-stroke" />
                    <circle cx={handle.to[0]} cy={handle.to[1]} r={3 / pxPerMetre} className="ppl-guided__target-dot" />
                    <circle
                      ref={fromRef}
                      cx={handle.from[0]}
                      cy={handle.from[1]}
                      r={13 / pxPerMetre}
                      className={cx('ppl-guided__handle', busy === 'drag' && 'is-dragging')}
                      vectorEffect="non-scaling-stroke"
                      style={{ opacity: atRest ? undefined : 0 }}
                    />
                  </g>
                )
              }
            </PaperCanvas>
          </div>
          <div className="ppl-guided__panel">
            <div className="ppl-guided__caption" aria-live="polite">
              <span className="ppl-eyebrow ppl-num">
                Step {done + 1} of {count}
              </span>
              <p className="ppl-guided__text">{caption}</p>
              <p className="ppl-guided__hint">{hint}</p>
            </div>
            <div className="ppl-guided__actions">
              <IconButton icon="undo" label="Back one step" onClick={() => setDone(done - 1)} disabled={done === 0 || busy !== 'idle'} />
              <IconButton icon="menu" label="All steps" onClick={() => setListOpen(true)} />
              <Button size="md" icon="eye" onClick={showMe} disabled={busy !== 'idle' || playAll}>
                Show me
              </Button>
              <Button size="md" variant="primary" icon={isFlip ? 'flip' : 'fold'} onClick={() => finishStep(0)} disabled={busy !== 'idle' || playAll}>
                {isFlip ? 'Turn it over' : 'Fold it for me'}
              </Button>
              <Button size="md" variant="ghost" icon={playAll ? 'pause' : 'play'} onClick={() => setPlayAll((p) => !p)}>
                {playAll ? 'Stop' : 'Play all'}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="ppl-guided__stage" style={{ width: `min(100%, calc((100dvh - ${compact ? 360 : 330}px) * 1.333))` }}>
            <FoldPlayer key={`${build.geometryKey}`} design={design} mode="auto" defaultStep={count} autoPlay showControls={false} onComplete={() => setShaped(true)} />
          </div>
          <div className="ppl-guided__panel">
            <div className="ppl-guided__caption" aria-live="polite">
              <span className="ppl-eyebrow">{shaped ? 'Folded' : 'Shaping'}</span>
              <p className="ppl-guided__text">{shaped ? `Your ${design.name} is folded.` : 'Now it becomes a plane: fold it in half, then fold the wings down and open them.'}</p>
            </div>
            <div className="ppl-guided__actions">
              {count > 0 && <IconButton icon="undo" label="Back to the last fold" onClick={() => setDone(count - 1)} />}
              <Button variant="ghost" icon="replay" onClick={restart}>
                Fold again
              </Button>
              <Button variant="primary" icon="next" onClick={onComplete}>
                {shaped ? finishLabel : 'Skip'}
              </Button>
            </div>
          </div>
        </>
      )}

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Folding steps" description={`${design.name}: ${count} folds, then shaping.`}>
        <ol className="ppl-guided__list">
          {frames.map((f, i) => (
            <li key={i} className={cx('ppl-guided__item', i < done && 'is-done', i === done && 'is-current')}>
              <span className="ppl-guided__num ppl-num" aria-hidden="true">
                {i < done ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <span className="ppl-guided__itemtext">{stepCaption(f.step)}</span>
              {i < done && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setListOpen(false);
                    setShaped(false);
                    setDone(i);
                  }}
                >
                  Redo from here
                </Button>
              )}
            </li>
          ))}
        </ol>
      </Sheet>
    </div>
  );
}
