import type { ReactElement, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icons';
import './EmptyState.css';

export interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode;
  icon?: IconName;
  /** Replaces the icon badge, e.g. a <Professor>. */
  illustration?: ReactNode;
  /** Buttons or links. */
  actions?: ReactNode;
  /** Less vertical padding, for use inside cards. */
  compact?: boolean;
  /** Heading level of the title. Default h2. */
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}

export function EmptyState({ title, body, icon = 'sparkle', illustration, actions, compact, as: H = 'h2', className }: EmptyStateProps): ReactElement {
  return (
    <div className={cx('ppl-empty', compact && 'ppl-empty--compact', className)}>
      {illustration ?? (
        <div className="ppl-empty__badge" aria-hidden="true">
          <svg className="ppl-empty__sheet" viewBox="0 0 96 96" fill="none">
            <path d="M18 14h46l14 14v54H18z" fill="var(--card)" stroke="var(--line)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M64 14v14h14" fill="var(--paper-2)" stroke="var(--line)" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <Icon name={icon} size={36} className="ppl-empty__icon" />
        </div>
      )}
      <H className="ppl-empty__title ppl-h2">{title}</H>
      {body && <div className="ppl-empty__body">{body}</div>}
      {actions && <div className="ppl-empty__actions">{actions}</div>}
    </div>
  );
}
