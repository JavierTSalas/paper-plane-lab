import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { PlaneDesign } from '../../../core/types';
import { IconButton } from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { useReducedMotion } from '../../../ui/motion';
import { Slider } from '../../../ui/Slider';
import { SceneView, type SceneHandle } from './SceneView';
import { buildTimeline, fitAt, sceneAt, type Timeline } from './timeline';

export interface FoldPlayerProps {
  design: PlaneDesign;
  /** auto: plays every step in a row. manual: plays one step, then waits for Next. Default 'auto'. */
  mode?: 'auto' | 'manual';
  /** Controlled step index (0-based, flat steps then the shaping stages). */
  step?: number;
  /** Initial step when uncontrolled. Default 0. */
  defaultStep?: number;
  /** Start playing on mount. Default: true in auto mode, false in manual mode. */
  autoPlay?: boolean;
  /** Playback speed multiplier. Default 1. */
  speed?: number;
  onStepChange?: (step: number) => void;
  /** Fires once when the last step has finished playing. */
  onComplete?: () => void;
  /** Previous, play / pause, next, replay and a scrubber. Default true. */
  showControls?: boolean;
  className?: string;
}

const segIndex = (pos: number, count: number): number => Math.max(0, Math.min(count - 1, Math.floor(pos)));

/** Plays a design's folding like a tutorial: every flat step, then the plane is folded in half, the wings folded down and opened. */
export function FoldPlayer({
  design,
  mode = 'auto',
  step,
  defaultStep = 0,
  autoPlay,
  speed = 1,
  onStepChange,
  onComplete,
  showControls = true,
  className,
}: FoldPlayerProps): ReactElement {
  const tl: Timeline = useMemo(() => buildTimeline(design), [design]);
  const count = tl.segments.length;
  const reduced = useReducedMotion();
  const scene = useRef<SceneHandle>(null);

  const controlled = step !== undefined;
  const [innerStep, setInnerStep] = useState(() => Math.min(count - 1, Math.max(0, defaultStep)));
  const current = Math.min(count - 1, Math.max(0, controlled ? step : innerStep));
  const [playing, setPlaying] = useState(autoPlay ?? mode === 'auto');
  // Position on the timeline: step i occupies [i, i + 1].
  const pos = useRef(current);
  const [shownPos, setShownPos] = useState(current);
  const stepRef = useRef(current);
  const completed = useRef(false);

  const cb = useRef({ onStepChange, onComplete });
  cb.current = { onStepChange, onComplete };

  const drawAt = useCallback(
    (p: number): void => {
      const i = segIndex(p, count);
      const u = Math.min(1, Math.max(0, p - i));
      const s = sceneAt(tl, i, u, reduced);
      scene.current?.draw({
        faces: s.faces,
        paper: tl.design.paper,
        yaw: s.yaw,
        pitch: s.pitch,
        fit: fitAt(tl, i, u, reduced),
        creases: s.creases,
        highlight: s.highlight,
        overlayZ: 0,
        shadows: true,
      });
    },
    [tl, count, reduced],
  );

  const goTo = useCallback(
    (i: number, p: number = i): void => {
      pos.current = p;
      setShownPos(p);
      if (i !== stepRef.current) {
        stepRef.current = i;
        if (!controlled) setInnerStep(i);
        cb.current.onStepChange?.(i);
      }
      drawAt(p);
    },
    [controlled, drawAt],
  );

  // A new step from the parent (controlled) starts that step; in manual mode it plays it.
  useEffect(() => {
    if (current === stepRef.current) return;
    stepRef.current = current;
    pos.current = current;
    setShownPos(current);
    completed.current = false;
    drawAt(current);
    if (mode === 'manual') setPlaying(true);
  }, [current, mode, drawAt]);

  // New design: start over.
  const firstDesign = useRef(true);
  useEffect(() => {
    if (firstDesign.current) {
      firstDesign.current = false;
      return;
    }
    completed.current = false;
    goTo(0, 0);
  }, [tl, goTo]);

  useLayoutEffect(() => drawAt(pos.current), [drawAt]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastT = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      const i = segIndex(pos.current, count);
      const seg = tl.segments[i]!;
      let p = pos.current + (dt * speed) / seg.duration;
      if (p >= i + 1) {
        if (mode === 'manual' || i + 1 >= count) {
          // Stop on the last instant of this step so the caption stays with it.
          p = i + 1 >= count ? count : i + 1 - 1e-9;
          pos.current = p;
          setShownPos(p);
          drawAt(p);
          setPlaying(false);
          if (i + 1 >= count && !completed.current) {
            completed.current = true;
            cb.current.onComplete?.();
          }
          return;
        }
        goTo(i + 1, p);
      } else {
        pos.current = p;
        setShownPos(p);
        drawAt(p);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, count, tl, speed, mode, drawAt, goTo]);

  const atEnd = shownPos >= count - 1e-6;
  const index = segIndex(shownPos, count);

  const play = (): void => {
    if (atEnd) {
      completed.current = false;
      goTo(0, 0);
    } else if (mode === 'manual' && shownPos >= index + 1 - 1e-6) {
      goTo(index + 1);
    }
    setPlaying(true);
  };
  const next = (): void => {
    if (index + 1 >= count) {
      goTo(index, count);
      setPlaying(false);
      return;
    }
    goTo(index + 1);
    if (mode === 'manual') setPlaying(true);
  };
  const prev = (): void => {
    // Mid-step, go back to its start; at its start, to the previous step.
    const target = shownPos - index > 0.25 ? index : Math.max(0, index - 1);
    goTo(target);
    if (mode === 'manual') setPlaying(true);
  };
  const replay = (): void => {
    completed.current = false;
    goTo(0, 0);
    setPlaying(true);
  };

  const seg = tl.segments[index]!;
  const flatCount = tl.fold.frames.length;
  return (
    <div className={cx('ppl-player', className)}>
      <SceneView ref={scene} aspect={4 / 3} pad={16} label={`${design.name}: ${seg.label}`} className="ppl-player__stage" onResize={() => drawAt(pos.current)} />
      <div className="ppl-player__caption" aria-live="polite">
        <span className="ppl-player__count ppl-num">
          Step {index + 1} of {count}
          {index >= flatCount && <span className="ppl-player__phase"> · shaping</span>}
        </span>
        <p className="ppl-player__label">{seg.label}</p>
      </div>
      {showControls && (
        <div className="ppl-player__controls">
          <div className="ppl-player__buttons">
            <IconButton icon="back" label="Previous step" onClick={prev} disabled={shownPos <= 0} />
            <IconButton
              icon={playing ? 'pause' : 'play'}
              label={playing ? 'Pause' : atEnd ? 'Play again' : 'Play'}
              variant="primary"
              onClick={() => (playing ? setPlaying(false) : play())}
            />
            <IconButton icon="next" label="Next step" onClick={next} disabled={atEnd} />
            <IconButton icon="replay" label="Replay from the start" onClick={replay} />
          </div>
          <Slider
            className="ppl-player__scrub"
            label="Fold progress"
            hideLabel
            min={0}
            max={count}
            step={0.01}
            value={shownPos}
            format={(v) => `Step ${segIndex(v, count) + 1} of ${count}`}
            onChange={(v) => {
              setPlaying(false);
              completed.current = false;
              goTo(segIndex(v, count), v);
            }}
          />
        </div>
      )}
    </div>
  );
}
