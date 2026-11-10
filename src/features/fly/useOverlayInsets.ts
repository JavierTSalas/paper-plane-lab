import { useLayoutEffect, useState, type RefObject } from 'react';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * How much of `page` the overlays cover from each side, px. A wide overlay counts from the bottom (or top);
 * a narrow one from whichever side it hugs.
 */
export function useOverlayInsets(page: RefObject<HTMLElement | null>, overlays: readonly RefObject<HTMLElement | null>[], key: unknown): Insets {
  const [insets, setInsets] = useState<Insets>(ZERO);
  useLayoutEffect(() => {
    const root = page.current;
    if (!root) return;
    const measure = (): void => {
      const p = root.getBoundingClientRect();
      const next = { ...ZERO };
      for (const ref of overlays) {
        const el = ref.current;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width > p.width * 0.6) {
          if (r.top - p.top < p.height * 0.3) next.top = Math.max(next.top, r.bottom - p.top);
          else next.bottom = Math.max(next.bottom, p.bottom - r.top);
        } else if (r.left - p.left < p.right - r.right) next.left = Math.max(next.left, r.right - p.left);
        else next.right = Math.max(next.right, p.right - r.left);
      }
      setInsets((old) => (old.top === next.top && old.right === next.right && old.bottom === next.bottom && old.left === next.left ? old : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    for (const ref of overlays) if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
    // `key` changes when overlays mount or unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return insets;
}
