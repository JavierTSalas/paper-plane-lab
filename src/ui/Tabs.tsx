import { useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icons';
import './Tabs.css';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: IconName;
  /** Small count or text after the label. */
  badge?: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  /** Accessible name of the tab list. */
  label: string;
  items: readonly TabItem<T>[];
  /** Controlled selection. */
  value?: T;
  /** Uncontrolled initial selection. Default: the first item. */
  defaultValue?: T;
  onChange?: (id: T) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

/** WAI-ARIA tabs with automatic activation: arrow keys select, Home and End jump. */
export function Tabs<T extends string>({ label, items, value, defaultValue, onChange, variant = 'underline', className }: TabsProps<T>): ReactElement {
  const base = useId();
  const [inner, setInner] = useState<T | undefined>(defaultValue ?? items[0]?.id);
  const current = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const select = (id: T): void => {
    setInner(id);
    onChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    const enabled = items.map((it, k) => (it.disabled ? -1 : k)).filter((k) => k >= 0);
    const pos = enabled.indexOf(i);
    let target: number | undefined;
    if (e.key === 'ArrowRight') target = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') target = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') target = enabled[0];
    else if (e.key === 'End') target = enabled[enabled.length - 1];
    if (target === undefined) return;
    e.preventDefault();
    const item = items[target];
    if (item) select(item.id);
    refs.current[target]?.focus();
  };

  const active = items.find((it) => it.id === current) ?? items[0];
  return (
    <div className={cx('ppl-tabs', `ppl-tabs--${variant}`, className)}>
      <div role="tablist" aria-label={label} className="ppl-tabs__list">
        {items.map((it, i) => {
          const selected = it.id === active?.id;
          return (
            <button
              key={it.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${base}-tab-${it.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel-${it.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={it.disabled}
              className={cx('ppl-tabs__tab', selected && 'is-selected')}
              onClick={() => select(it.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {it.icon && <Icon name={it.icon} size={18} />}
              <span>{it.label}</span>
              {it.badge !== undefined && <span className="ppl-tabs__badge ppl-num">{it.badge}</span>}
            </button>
          );
        })}
      </div>
      {active && (
        <div
          id={`${base}-panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${active.id}`}
          tabIndex={0}
          className="ppl-tabs__panel"
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
