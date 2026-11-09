import { useEffect, useRef, useSyncExternalStore, type ReactElement } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icons';
import './Toast.css';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
  /** Overrides the tone's icon. */
  icon?: IconName;
  /** Milliseconds before it leaves. 0 keeps it until dismissed. Default 4000. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export interface ToastItem extends ToastInput {
  id: number;
}

/* ------------------------------------------------------------------ store */

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, number>();
const MAX_VISIBLE = 3;

function emit(): void {
  listeners.forEach((l) => l());
}

export function dismissToast(id: number): void {
  const t = timers.get(id);
  if (t !== undefined) window.clearTimeout(t);
  timers.delete(id);
  items = items.filter((it) => it.id !== id);
  emit();
}

/** Show a toast. Returns its id (for `dismissToast`). Needs one <ToastHost /> mounted. */
export function toast(input: ToastInput): number {
  const id = nextId++;
  items = [...items, { ...input, id }].slice(-MAX_VISIBLE);
  const duration = input.duration ?? 4000;
  if (duration > 0 && typeof window !== 'undefined') timers.set(id, window.setTimeout(() => dismissToast(id), duration));
  emit();
  return id;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getItems = (): ToastItem[] => items;

/* ------------------------------------------------------------------ host */

const TONE_ICON: Record<ToastTone, IconName> = { info: 'info', success: 'check', warning: 'warning', danger: 'warning' };

/**
 * Renders the toast stack. A manual popover keeps it in the top layer, above open sheets. It stays open
 * (empty and click-through when idle) so the live region exists before a message arrives, and is re-shown
 * on every new toast so it sits above anything opened since.
 */
export function ToastHost(): ReactElement {
  const list = useSyncExternalStore(subscribe, getItems, getItems);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.showPopover !== 'function') return;
    if (el.matches(':popover-open')) {
      if (list.length === 0) return;
      el.hidePopover();
    }
    el.showPopover();
  }, [list]);

  return (
    <div ref={ref} popover="manual" className="ppl-toasts" role="region" aria-label="Notifications">
      <ol role="list" className="ppl-toasts__list" aria-live="polite">
        {list.map((t) => {
          const tone = t.tone ?? 'info';
          return (
            <li key={t.id} className={cx('ppl-toast', `ppl-toast--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
              <span className="ppl-toast__icon">
                <Icon name={t.icon ?? TONE_ICON[tone]} size={20} />
              </span>
              <div className="ppl-toast__text">
                <p className="ppl-toast__title">{t.title}</p>
                {t.body && <p className="ppl-toast__body">{t.body}</p>}
              </div>
              {t.action && (
                <button
                  type="button"
                  className="ppl-toast__action"
                  onClick={() => {
                    t.action?.onClick();
                    dismissToast(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" className="ppl-toast__close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
                <Icon name="close" size={18} />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
