import { useId, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';
import './Toggle.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Keep the label for assistive tech only. */
  hideLabel?: boolean;
  className?: string;
}

/** On/off switch. The whole row is the hit target. */
export function Toggle({ checked, onChange, label, description, disabled, hideLabel, className }: ToggleProps): ReactElement {
  const descId = useId();
  return (
    <label className={cx('ppl-toggle', disabled && 'is-disabled', className)}>
      <span className={cx('ppl-toggle__text', hideLabel && 'ppl-sr-only')}>
        <span className="ppl-toggle__label">{label}</span>
        {description && (
          <span id={descId} className="ppl-toggle__desc">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="ppl-toggle__input"
        checked={checked}
        disabled={disabled}
        aria-describedby={description ? descId : undefined}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="ppl-toggle__track" aria-hidden="true">
        <span className="ppl-toggle__thumb" />
      </span>
    </label>
  );
}
