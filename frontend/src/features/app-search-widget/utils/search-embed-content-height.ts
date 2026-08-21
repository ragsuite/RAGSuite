/** Minimum iframe height the parent loader accepts for the search box. */
export const SEARCH_EMBED_MIN_HEIGHT = 72;

/** Default empty search-box height when layout has not measured yet. */
export const SEARCH_EMBED_DEFAULT_HEIGHT = 88;

/**
 * Clamp a measured content height for AppSearch embed `resize` postMessage.
 * Prefer content metrics over iframe fill height.
 */
export function clampSearchEmbedContentHeight(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return SEARCH_EMBED_DEFAULT_HEIGHT;
  return Math.max(SEARCH_EMBED_MIN_HEIGHT, Math.ceil(height));
}

/**
 * Prefer DOM content box over flex-fill height when measuring the host node.
 */
export function measureSearchEmbedHostHeight(node: HTMLElement | null | undefined): number {
  if (!node) return 0;
  const rectH = node.getBoundingClientRect().height;
  const scrollH = node.scrollHeight;
  const offsetH = node.offsetHeight;
  const candidates = [rectH, scrollH, offsetH].filter((n) => Number.isFinite(n) && n > 0);
  if (candidates.length === 0) return 0;
  return Math.max(...candidates);
}
