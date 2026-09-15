/**
 * Public embed iframe routes (`/embed/chatbot`, `/embed/search`, …).
 * Used to skip dashboard AppProviders and avoid admin sign-in redirects.
 */
export function isPublicEmbedPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? '').trim().split(/[?#]/)[0] || '';
  if (!path) return false;
  return path === '/embed/chatbot' || path.startsWith('/embed/');
}

/**
 * Whether root layout should use the minimal embed shell (no AppProviders).
 * Prefer router `pathname` once known; only fall back to `window.location`
 * when pathname is empty/`/` so a client nav to `/sign-in` is not stuck in embed mode.
 */
export function resolveIsEmbedShell(input: {
  pathname: string | null | undefined;
  windowPathname?: string | null;
}): boolean {
  const pathname = String(input.pathname ?? '').trim();
  if (pathname && pathname !== '/') {
    return isPublicEmbedPath(pathname);
  }
  const windowPath = String(input.windowPathname ?? '').trim();
  return isPublicEmbedPath(windowPath);
}

/** True when the browser (or given path) is on a public embed iframe route. */
export function isPublicEmbedLocation(pathname?: string | null): boolean {
  if (pathname != null) {
    return isPublicEmbedPath(pathname);
  }
  if (typeof window === 'undefined') return false;
  return isPublicEmbedPath(window.location?.pathname);
}
