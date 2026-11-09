import type { ReactElement, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icons';
import './Stat.css';

export interface StatDelta {
  /** Pre-formatted, signed: "+1.2 m". */
  value: string;
  direction: 'up' | 'down' | 'flat';
  /** Whether this change is good news. Decides the colour; the arrow and words carry the meaning too. */
  sentiment?: 'good' | 'bad' | 'neutral';
  /** What it is compared with: "vs last throw". */
  label?: string;
}

export interface StatProps {
  label: ReactNode;
  /** Pre-formatted number (see src/ui/format.ts). */
  value: ReactNode;
  unit?: ReactNode;
  delta?: StatDelta;
  icon?: IconName;
  /** Slot after the label, typically an <InfoDot>. */
  info?: ReactNode;
  /** Small line under the value. */
  hint?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const DELTA_ICON: Record<StatDelta['direction'], IconName> = { up: 'back', down: 'back', flat: 'minus' };
const DELTA_WORD: Record<StatDelta['direction'], string> = { up: 'Up', down: 'Down', flat: 'No change' };

export function Stat({ label, value, unit, delta, icon, info, hint, size = 'md', className }: StatProps): ReactElement {
  return (
    <div className={cx('ppl-stat', `ppl-stat--${size}`, className)}>
      <div className="ppl-stat__label">
        {icon && <Icon name={icon} size={16} className="ppl-stat__icon" />}
        <span>{label}</span>
        {info}
      </div>
      <div className="ppl-stat__value">
        <span className="ppl-stat__num">{value}</span>
        {unit && <span className="ppl-stat__unit">{unit}</span>}
      </div>
      {delta && (
        <div className={cx('ppl-stat__delta', `is-${delta.sentiment ?? 'neutral'}`)}>
          <Icon name={DELTA_ICON[delta.direction]} size={14} strokeWidth={2.6} className={`ppl-stat__arrow is-${delta.direction}`} />
          <span className="ppl-sr-only">{DELTA_WORD[delta.direction]}</span>
          <span className="ppl-num">{delta.value}</span>
          {delta.label && <span className="ppl-stat__vs">{delta.label}</span>}
        </div>
      )}
      {hint && <div className="ppl-stat__hint">{hint}</div>}
    </div>
  );
}

export interface StatGridProps {
  children: ReactNode;
  /** Minimum tile width in px before the grid wraps. Default 140 (two columns on a phone). */
  minWidth?: number;
  /** Draw each stat as a small card. Default true. */
  boxed?: boolean;
  className?: string;
}

export function StatGrid({ children, minWidth = 140, boxed = true, className }: StatGridProps): ReactElement {
  return (
    <div
      className={cx('ppl-statgrid', boxed && 'ppl-statgrid--boxed', className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}
