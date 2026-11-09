import { useCallback, useEffect, useRef } from 'react';

export interface TweenLeg {
  to: number;
  /** Milliseconds. */
  ms: number;
}

const ease = (u: number): number => (1 - Math.cos(Math.PI * u)) / 2;

/**
 * Runs a value through a chain of eased legs on requestAnimationFrame. `set` receives every value;
 * `done` runs after the last leg. Starting a new tween cancels the running one. With `reduced`
 * the value jumps straight to each leg's end.
 */
export function useTween(set: (v: number) => void, reduced: boolean): { run: (from: number, legs: readonly TweenLeg[], done?: () => void) => void; stop: () => void } {
  const raf = useRef(0);
  const setRef = useRef(set);
  setRef.current = set;

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const run = useCallback(
    (from: number, legs: readonly TweenLeg[], done?: () => void) => {
      stop();
      if (reduced || legs.length === 0) {
        const last = legs[legs.length - 1];
        setRef.current(last ? last.to : from);
        done?.();
        return;
      }
      let leg = 0;
      let start = from;
      let t0 = -1;
      const tick = (now: number): void => {
        if (t0 < 0) t0 = now;
        const l = legs[leg]!;
        const u = l.ms > 0 ? Math.min(1, (now - t0) / l.ms) : 1;
        setRef.current(start + (l.to - start) * ease(u));
        if (u >= 1) {
          leg++;
          start = l.to;
          t0 = now;
          if (leg >= legs.length) {
            raf.current = 0;
            done?.();
            return;
          }
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [reduced, stop],
  );

  useEffect(() => stop, [stop]);
  return { run, stop };
}
