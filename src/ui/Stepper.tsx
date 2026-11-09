import type { ReactElement, ReactNode } from 'react';
import { Button } from './Button';
import { cx } from './cx';
import './Stepper.css';

export interface StepperProps {
  /** Number of steps. */
  count: number;
  /** Current step, 0-based. */
  index: number;
  /** Makes the dots clickable (jump to a step) and enables Back / Next. */
  onIndexChange?: (index: number) => void;
  /** Accessible name of the step list, e.g. "Folding steps". */
  label?: string;
  /** Optional name per step, used for dot tooltips and screen readers. */
  stepLabels?: readonly string[];
  /** Show Back / Next buttons around the dots. */
  controls?: boolean;
  /** Called by Next on the last step (Next then reads `finishLabel`). */
  onFinish?: () => void;
  finishLabel?: ReactNode;
  /** Steps after this index cannot be jumped to yet (guided flows). Default: all reachable. */
  maxReachable?: number;
  className?: string;
}

/** Progress through a step-by-step flow: "Step 3 of 8" with dots, optional Back / Next. */
export function Stepper({
  count,
  index,
  onIndexChange,
  label = 'Steps',
  stepLabels,
  controls = false,
  onFinish,
  finishLabel = 'Done',
  maxReachable = count - 1,
  className,
}: StepperProps): ReactElement {
  const last = index >= count - 1;
  const go = (i: number): void => onIndexChange?.(Math.min(count - 1, Math.max(0, i)));
  const name = (i: number): string => stepLabels?.[i] ?? `Step ${i + 1}`;

  return (
    <nav className={cx('ppl-stepper', controls && 'ppl-stepper--controls', className)} aria-label={label}>
      {controls && (
        <Button variant="ghost" size="sm" icon="back" disabled={index === 0 || !onIndexChange} onClick={() => go(index - 1)}>
          Back
        </Button>
      )}
      <div className="ppl-stepper__center">
        <ol className="ppl-stepper__dots" role="list">
          {Array.from({ length: count }, (_, i) => {
            const state = i < index ? 'done' : i === index ? 'current' : 'todo';
            const dot = <span className={cx('ppl-stepper__dot', `is-${state}`)} />;
            return (
              <li key={i}>
                {onIndexChange ? (
                  <button
                    type="button"
                    className="ppl-stepper__hit"
                    aria-label={name(i)}
                    aria-current={i === index ? 'step' : undefined}
                    title={name(i)}
                    disabled={i > maxReachable}
                    onClick={() => go(i)}
                  >
                    {dot}
                  </button>
                ) : (
                  <span className="ppl-stepper__hit" aria-current={i === index ? 'step' : undefined}>
                    {dot}
                    <span className="ppl-sr-only">{name(i)}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="ppl-stepper__count ppl-num" aria-live="polite">
          Step {Math.min(index + 1, count)} of {count}
        </p>
      </div>
      {controls && (
        <Button
          variant={last ? 'primary' : 'secondary'}
          size="sm"
          iconRight={last ? 'check' : 'next'}
          disabled={last ? !onFinish : !onIndexChange || index + 1 > maxReachable}
          onClick={() => (last ? onFinish?.() : go(index + 1))}
        >
          {last ? finishLabel : 'Next'}
        </Button>
      )}
    </nav>
  );
}
