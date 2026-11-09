import { useCallback, useId, useLayoutEffect, useRef, useState, type ToggleEvent } from 'react';

export type PopoverAlign = 'start' | 'end' | 'center';

const GAP = 8;
const EDGE = 8;

/** Place `pop` (position: fixed) under `anchor`, flipping above when it would leave the viewport. */
export function placePopover(anchor: HTMLElement, pop: HTMLElement, align: PopoverAlign): void {
  const a = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  let left = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
  left = Math.min(Math.max(EDGE, left), vw - w - EDGE);
  let top = a.bottom + GAP;
  if (top + h > vh - EDGE && a.top - GAP - h >= EDGE) top = a.top - GAP - h;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

/**
 * Native popover (`popover="auto"`: top layer, light dismiss, Escape) anchored to a trigger.
 * Wire `triggerProps` onto the button and `popoverProps` onto the popover element.
 */
export function useAnchoredPopover(align: PopoverAlign) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const place = useCallback(() => {
    if (triggerRef.current && popoverRef.current) placePopover(triggerRef.current, popoverRef.current, align);
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    if (popoverRef.current) popoverRef.current.style.visibility = '';
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // The native toggle event arrives a frame after the popover shows; stay invisible until placed.
  const onBeforeToggle = (e: ToggleEvent<HTMLDivElement>): void => {
    if (e.newState === 'open') e.currentTarget.style.visibility = 'hidden';
  };

  const onToggle = (e: ToggleEvent<HTMLDivElement>): void => {
    const isOpen = e.newState === 'open';
    setOpen(isOpen);
    // Return focus to the trigger when the popover closes with focus inside it.
    if (!isOpen && popoverRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
  };

  const close = useCallback(() => {
    const el = popoverRef.current;
    if (el?.matches(':popover-open')) el.hidePopover();
  }, []);

  return {
    open,
    close,
    triggerRef,
    popoverRef,
    triggerProps: {
      ref: triggerRef,
      popoverTarget: id,
      'aria-expanded': open,
      'aria-controls': id,
    },
    popoverProps: {
      ref: popoverRef,
      id,
      popover: 'auto' as const,
      onBeforeToggle,
      onToggle,
    },
  };
}
