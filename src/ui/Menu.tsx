import { useLayoutEffect, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { buttonClass } from './Button';
import { cx } from './cx';
import { Icon, type IconName } from './icons';
import { useAnchoredPopover, type PopoverAlign } from './popover';
import './Menu.css';

export interface MenuAction {
  id: string;
  label: ReactNode;
  icon?: IconName;
  /** Secondary line under the label. */
  hint?: ReactNode;
  /** Either an action... */
  onSelect?: () => void;
  /** ...or a link (hash routes like "#/notebook"). */
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

export type MenuEntry = MenuAction | 'separator';

export interface MenuProps {
  /** Accessible name of the trigger, e.g. "More". */
  label: string;
  items: readonly MenuEntry[];
  /** Trigger icon. Default "menu". */
  icon?: IconName;
  /** Visible trigger text; without it the trigger is an icon button. */
  text?: ReactNode;
  align?: PopoverAlign;
  className?: string;
}

/** Menu button with a popover list. Arrow keys, Home and End move; Escape or a tap outside closes. */
export function Menu({ label, items, icon = 'menu', text, align = 'end', className }: MenuProps): ReactElement {
  const { open, triggerProps, popoverProps, popoverRef, close } = useAnchoredPopover(align);

  const menuItems = (): HTMLElement[] =>
    Array.from(popoverRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  // Runs after the popover hook has placed and revealed the list, so the item can take focus.
  useLayoutEffect(() => {
    if (open) menuItems()[0]?.focus();
    // menuItems reads the DOM; only the open transition matters.
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const list = menuItems();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (e.key === 'ArrowDown') next = list[(i + 1) % list.length];
    else if (e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    else if (e.key === 'Tab') close();
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const pick = (item: MenuAction): void => {
    if (item.disabled) return;
    close();
    item.onSelect?.();
  };

  return (
    <div className={cx('ppl-menu', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-label={text ? undefined : label}
        title={text ? undefined : label}
        className={text ? buttonClass({ variant: 'ghost', size: 'sm' }) : 'ppl-iconbtn ppl-btn--ghost ppl-iconbtn--md'}
        {...triggerProps}
      >
        <Icon name={icon} size={text ? 18 : 24} />
        {text && <span>{text}</span>}
      </button>
      <div {...popoverProps} role="menu" aria-label={label} className="ppl-pop ppl-menu__list" onKeyDown={onKeyDown}>
        {items.map((item, i) =>
          item === 'separator' ? (
            <div key={`sep-${i}`} role="separator" className="ppl-menu__sep" />
          ) : item.href && !item.disabled ? (
            <a
              key={item.id}
              role="menuitem"
              href={item.href}
              tabIndex={-1}
              className={cx('ppl-menu__item', item.danger && 'is-danger')}
              onClick={() => pick(item)}
            >
              <MenuItemBody item={item} />
            </a>
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              className={cx('ppl-menu__item', item.danger && 'is-danger')}
              onClick={() => pick(item)}
            >
              <MenuItemBody item={item} />
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function MenuItemBody({ item }: { item: MenuAction }): ReactElement {
  return (
    <>
      {item.icon && <Icon name={item.icon} size={20} className="ppl-menu__icon" />}
      <span className="ppl-menu__text">
        <span className="ppl-menu__label">{item.label}</span>
        {item.hint && <span className="ppl-menu__hint">{item.hint}</span>}
      </span>
    </>
  );
}
