import type { ReactElement, ReactNode } from 'react';
import { cx } from '../cx';
import { Icon } from '../icons';
import './charts.css';

export interface BarMeterProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  /** The range that counts as good, e.g. a healthy static margin. */
  good: readonly [number, number];
  /** Pre-formatted value text, e.g. "7 %". */
  valueText: string;
  /** Words for the three states. Defaults: "Too low" / "Good" / "Too high". */
  words?: { low: string; good: string; high: string };
  /** Small legend under the bar, e.g. "Good: 5 - 15 % of chord". */
  hint?: ReactNode;
  className?: string;
}

export type MeterState = 'low' | 'good' | 'high';

export function meterState(value: number, good: readonly [number, number]): MeterState {
  return value < good[0] ? 'low' : value > good[1] ? 'high' : 'good';
}

const DEFAULT_WORDS = { low: 'Too low', good: 'Good', high: 'Too high' };

/** Horizontal meter with a marked "good" band. The state is spelled out in words and an icon, never colour alone. */
export function BarMeter({ label, value, min, max, good, valueText, words = DEFAULT_WORDS, hint, className }: BarMeterProps): ReactElement {
  const span = max - min || 1;
  const pct = (v: number): number => Math.min(100, Math.max(0, ((v - min) / span) * 100));
  const state = meterState(value, good);
  return (
    <div className={cx('ppl-meter', `ppl-meter--${state}`, className)}>
      <div className="ppl-meter__head">
        <span className="ppl-meter__label">{label}</span>
        <span className="ppl-meter__value ppl-num">{valueText}</span>
      </div>
      <div
        className="ppl-meter__track"
        role="meter"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${valueText}, ${words[state]}`}
      >
        <span className="ppl-meter__band" style={{ left: `${pct(good[0])}%`, width: `${pct(good[1]) - pct(good[0])}%` }} />
        <span className="ppl-meter__fill" style={{ width: `${pct(value)}%` }} />
        <span className="ppl-meter__pin" style={{ left: `${pct(value)}%` }} />
      </div>
      <div className="ppl-meter__foot">
        <span className="ppl-meter__state">
          <Icon name={state === 'good' ? 'check' : 'warning'} size={16} />
          {words[state]}
        </span>
        {hint && <span className="ppl-meter__hint">{hint}</span>}
      </div>
    </div>
  );
}
