import type { ButtonHTMLAttributes, ReactElement, ReactNode, Ref } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icons';
import { Spinner } from './Spinner';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

/** Class list of a button, for links or router <Link>s that should look like one. */
export function buttonClass({ variant = 'secondary', size = 'md', block = false }: ButtonStyleOptions = {}): string {
  return cx('ppl-btn', `ppl-btn--${variant}`, `ppl-btn--${size}`, block && 'ppl-btn--block');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  icon?: IconName;
  iconRight?: IconName;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 18, md: 20, lg: 22 };

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  iconRight,
  loading = false,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps): ReactElement {
  const iconSize = ICON_SIZE[size];
  return (
    <button
      type={type}
      className={cx(buttonClass({ variant, size, block }), loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} label={null} /> : icon && <Icon name={icon} size={iconSize} />}
      {children !== undefined && <span className="ppl-btn__label">{children}</span>}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Accessible name; also shown as the tooltip. */
  label: string;
  variant?: Exclude<ButtonVariant, 'danger'>;
  size?: ButtonSize;
  /** Makes it a toggle button (aria-pressed). */
  pressed?: boolean;
  /** Small dot or count in the corner. */
  badge?: number | boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  pressed,
  badge,
  className,
  type = 'button',
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={cx('ppl-iconbtn', `ppl-btn--${variant}`, `ppl-iconbtn--${size}`, pressed && 'is-pressed', className)}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon name={icon} size={ICON_SIZE[size] + 2} />
      {badge !== undefined && badge !== false && (
        <span className="ppl-iconbtn__badge" aria-hidden="true">
          {typeof badge === 'number' ? badge : ''}
        </span>
      )}
    </button>
  );
}
