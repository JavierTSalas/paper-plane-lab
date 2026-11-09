import { useSyncExternalStore } from 'react';

/**
 * Reduced motion = the OS preference OR the in-app setting. The app calls
 * `setReducedMotionOverride` whenever the setting changes; components read `useReducedMotion()`.
 * CSS reads the same state from the `data-reduced-motion` attribute on <html> (see base.css).
 */
const QUERY = '(prefers-reduced-motion: reduce)';
let override = false;
const listeners = new Set<() => void>();

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

export function prefersReducedMotion(): boolean {
  return override || (media()?.matches ?? false);
}

export function setReducedMotionOverride(on: boolean): void {
  if (override === on) return;
  override = on;
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-reduced-motion', on);
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const mq = media();
  mq?.addEventListener('change', onChange);
  return () => {
    listeners.delete(onChange);
    mq?.removeEventListener('change', onChange);
  };
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
