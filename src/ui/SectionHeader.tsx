import type { ReactElement, ReactNode } from 'react';
import { cx } from './cx';
import './SectionHeader.css';

export interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  /** Right-aligned slot, usually a ghost Button or a link. */
  action?: ReactNode;
  /** Heading level. Default h2. */
  as?: 'h1' | 'h2' | 'h3';
  id?: string;
  className?: string;
}

export function SectionHeader({ title, subtitle, eyebrow, action, as: H = 'h2', id, className }: SectionHeaderProps): ReactElement {
  return (
    <header className={cx('ppl-sechead', className)}>
      <div className="ppl-sechead__text">
        {eyebrow && <p className="ppl-eyebrow">{eyebrow}</p>}
        <H id={id} className={cx('ppl-sechead__title', H === 'h3' ? 'ppl-h3' : H === 'h1' ? 'ppl-h1' : 'ppl-h2')}>
          {title}
        </H>
        {subtitle && <p className="ppl-sechead__sub">{subtitle}</p>}
      </div>
      {action && <div className="ppl-sechead__action">{action}</div>}
    </header>
  );
}
