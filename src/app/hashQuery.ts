/**
 * Hash routing keeps the query string in the real URL (`/?preset=x#/fold`), which is what wouter's
 * hash navigation writes and `useSearch` reads. Plain anchors and hand-typed deep links put it inside
 * the hash instead (`/#/fold?preset=x`), which no route matches. Rewrite that form in place.
 */
export function normaliseHashQuery(): boolean {
  const { hash } = window.location;
  const at = hash.indexOf('?');
  if (at < 0) return false;
  const url = new URL(window.location.href);
  url.hash = hash.slice(0, at);
  url.search = hash.slice(at + 1);
  window.history.replaceState(window.history.state, '', url.href);
  return true;
}

/** Normalise now and after every hash change. Call once, before the router mounts. */
export function installHashQueryNormaliser(): void {
  normaliseHashQuery();
  window.addEventListener('hashchange', () => {
    // Re-announce so the router re-reads the cleaned location.
    if (normaliseHashQuery()) window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
