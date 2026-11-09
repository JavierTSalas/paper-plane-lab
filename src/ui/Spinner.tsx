import type { ReactElement } from 'react';
import './Spinner.css';

export interface SpinnerProps {
  /** Diameter in px. Default 24. */
  size?: number;
  /** Announced to screen readers. Pass null when a parent already announces the busy state. */
  label?: string | null;
  className?: string;
}

/** A pencil-stroke arc chasing its own tail. Static under reduced motion. */
export function Spinner({ size = 24, label = 'Loading', className }: SpinnerProps): ReactElement {
  return (
    <span className={className ? `ppl-spinner ${className}` : 'ppl-spinner'} role={label ? 'status' : undefined}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {label && <span className="ppl-sr-only">{label}</span>}
    </span>
  );
}
