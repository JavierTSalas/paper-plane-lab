import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement, ReactNode } from 'react';
import type { Tone } from './Card';
import { cx } from './cx';
import { Icon, type IconName } from './icons';
import './Chip.css';

export type TagTone = Tone | 'good' | 'warn' | 'bad';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Toggle state (aria-pressed). Leave undefined for a plain action chip. */
  selected?: boolean;
  icon?: IconName;
  /** Colour of the leading dot. */
  tone?: Tone;
  size?: 'sm' | 'md';
  children: ReactNode;
}

/** Pill-shaped button for filters, choices and quick actions. Text stays ink; colour lives in the dot. */
export function Chip({ selected, icon, tone, size = 'md', className, type = 'button', children, ...rest }: ChipProps): ReactElement {
  return (
    <button
      type={type}
      className={cx('ppl-chip', `ppl-chip--${size}`, selected && 'is-selected', className)}
      aria-pressed={selected}
      {...rest}
    >
      {selected ? (
        <Icon name="check" size={16} className="ppl-chip__check" />
      ) : icon ? (
        <Icon name={icon} size={18} />
      ) : (
        tone && <span className={`ppl-dot ppl-dot--${tone}`} aria-hidden="true" />
      )}
      <span>{children}</span>
    </button>
  );
}

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  icon?: IconName;
  children: ReactNode;
}

/** Static label: category, status, difficulty. Status tones always pair with words or an icon. */
export function Tag({ tone = 'neutral', icon, className, children, ...rest }: TagProps): ReactElement {
  return (
    <span className={cx('ppl-tag', `ppl-tag--${tone}`, className)} {...rest}>
      {icon ? <Icon name={icon} size={14} strokeWidth={2.4} /> : tone !== 'neutral' && <span className={`ppl-dot ppl-dot--${tone}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
