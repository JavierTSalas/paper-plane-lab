import { useId, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './icons';
import { useAnchoredPopover } from './popover';
import './InfoDot.css';

export interface InfoDotProps {
  /** Accessible name of the button, e.g. "What is wing loading?". */
  label: string;
  /** Bold first line of the popover. */
  title?: ReactNode;
  /** One to three short sentences. */
  children: ReactNode;
  /** Notebook topic id; adds a "Read more" link to #/notebook/<topic>. */
  topic?: string;
  topicLabel?: string;
  className?: string;
}

/** Small "i" that opens a short explanation. Every number in the lab should be one tap from its meaning. */
export function InfoDot({ label, title, children, topic, topicLabel = 'Read more in the Notebook', className }: InfoDotProps): ReactElement {
  const { triggerProps, popoverProps } = useAnchoredPopover('center');
  const titleId = useId();
  return (
    <span className={cx('ppl-infodot', className)}>
      <button type="button" className="ppl-infodot__btn" aria-label={label} title={label} {...triggerProps}>
        <span className="ppl-infodot__glyph" aria-hidden="true">
          i
        </span>
      </button>
      <div {...popoverProps} role="dialog" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label} className="ppl-pop ppl-infodot__pop">
        {title && (
          <p id={titleId} className="ppl-infodot__title">
            {title}
          </p>
        )}
        <div className="ppl-infodot__body">{children}</div>
        {topic && (
          <a className="ppl-infodot__link" href={`#/notebook/${encodeURIComponent(topic)}`}>
            <Icon name="notebook" size={18} />
            {topicLabel}
          </a>
        )}
      </div>
    </span>
  );
}
