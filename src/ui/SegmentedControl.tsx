import { useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icons';
import './SegmentedControl.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  /** Accessible name when the visible label is an icon only. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  size?: 'sm' | 'md';
  /** Stretch to the container width. */
  block?: boolean;
  className?: string;
}

/** Radio group drawn as one pill with a sliding thumb. Arrow keys move the selection. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  block,
  className,
}: SegmentedControlProps<T>): ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const move = (from: number, delta: number): void => {
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + delta * step + n * step) % n;
      const option = options[i];
      if (option && !option.disabled) {
        onChange(option.value);
        refs.current[i]?.focus();
        return;
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(i, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(i, -1);
    else if (e.key === 'Home') move(-1, 1);
    else if (e.key === 'End') move(options.length, -1);
    else return;
    e.preventDefault();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cx('ppl-seg', `ppl-seg--${size}`, block && 'ppl-seg--block', className)}>
      <div className="ppl-seg__track" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        <span
          className="ppl-seg__thumb"
          aria-hidden="true"
          style={{ width: `${100 / options.length}%`, transform: `translateX(${index * 100}%)` }}
        />
        {options.map((o, i) => {
          const checked = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={o.ariaLabel}
              tabIndex={checked ? 0 : -1}
              disabled={o.disabled}
              className={cx('ppl-seg__opt', checked && 'is-checked')}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {o.icon && <Icon name={o.icon} size={size === 'sm' ? 16 : 18} />}
              {o.label !== '' && <span className="ppl-seg__label">{o.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
