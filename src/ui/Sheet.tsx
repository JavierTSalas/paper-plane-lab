import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { IconButton } from './Button';
import { cx } from './cx';
import { trapTab, useScrollLock } from './hooks';
import { prefersReducedMotion } from './motion';
import './Sheet.css';

export interface SheetProps {
  open: boolean;
  /** Called on Escape, backdrop tap, swipe down, or the close button. The parent sets `open` to false. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky action row at the bottom (buttons). */
  footer?: ReactNode;
  /** Width of the centred dialog on wide screens. */
  size?: 'sm' | 'md' | 'lg';
  /** Element to focus on open. Default: the first focusable element in the body, else the close button. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** When false, Escape and the backdrop do nothing (use for flows that need an explicit choice). */
  dismissible?: boolean;
  className?: string;
}

/** Exit animation length; matches --dur-2 in tokens.css. */
const EXIT_MS = 220;
/** Pull distance that closes the sheet on phones, px. */
const SWIPE_CLOSE_PX = 90;

/**
 * Bottom sheet on phones, centred dialog from 720 px. Built on a native modal <dialog>, which makes the
 * rest of the page inert; Tab is additionally wrapped so focus never leaves the sheet.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocus,
  dismissible = true,
  className,
}: SheetProps): ReactElement | null {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  if (open && !mounted) setMounted(true);
  if (open && closing) setClosing(false);
  if (!open && mounted && !closing) {
    if (prefersReducedMotion()) setMounted(false);
    else setClosing(true);
  }

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  if (!mounted) return null;
  return (
    <SheetDialog
      onClose={onClose}
      title={title}
      description={description}
      footer={footer}
      size={size}
      initialFocus={initialFocus}
      dismissible={dismissible}
      closing={closing}
      className={className}
    >
      {children}
    </SheetDialog>
  );
}

interface SheetDialogProps extends Omit<SheetProps, 'open'> {
  closing: boolean;
}

function SheetDialog({
  onClose,
  title,
  description,
  children,
  footer,
  size,
  initialFocus,
  dismissible,
  closing,
  className,
}: SheetDialogProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const downOnBackdrop = useRef(false);
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const titleId = useId();
  const descId = useId();

  useScrollLock(true);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const target =
      initialFocus?.current ??
      bodyRef.current?.querySelector<HTMLElement>('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])') ??
      closeRef.current;
    target?.focus();
    return () => {
      if (dialog.open) dialog.close();
      previous?.focus();
    };
    // Mount-only on purpose: focus is placed once per opening.
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>): void => {
    if (dialogRef.current) trapTab(dialogRef.current, e);
  };

  const onPointerDown = (e: PointerEvent<HTMLDialogElement>): void => {
    downOnBackdrop.current = e.target === dialogRef.current;
  };

  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>): void => {
    if (dismissible && downOnBackdrop.current && e.target === dialogRef.current) onClose();
    downOnBackdrop.current = false;
  };

  const startDrag = (e: PointerEvent<HTMLDivElement>): void => {
    if (!dismissible || e.pointerType === 'mouse') return;
    drag.current = { startY: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    panel.style.transform = `translateY(${d.dy}px)`;
  };

  const endDrag = (): void => {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel) return;
    panel.style.transform = '';
    if (d.dy > SWIPE_CLOSE_PX) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={cx('ppl-sheet', `ppl-sheet--${size}`, closing && 'is-closing', className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onClick={onBackdropClick}
    >
      <div ref={panelRef} className="ppl-sheet__panel">
        <div className="ppl-sheet__head" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <span className="ppl-sheet__grabber" aria-hidden="true" />
          <div className="ppl-sheet__titles">
            <h2 id={titleId} className="ppl-h2">
              {title}
            </h2>
            {description && (
              <p id={descId} className="ppl-sheet__desc">
                {description}
              </p>
            )}
          </div>
          <IconButton ref={closeRef} icon="close" label="Close" variant="ghost" onClick={onClose} className="ppl-sheet__close" />
        </div>
        <div ref={bodyRef} className="ppl-sheet__body">
          {children}
        </div>
        {footer && <div className="ppl-sheet__foot">{footer}</div>}
      </div>
    </dialog>
  );
}
