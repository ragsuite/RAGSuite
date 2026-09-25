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

/**
 * Pixels the language menu extends past the in-flow embed host.
 * The parent loader paints this as iframe overlap (negative margin) so the
 * host page layout box does not grow when the menu opens.
 */
export function measureSearchEmbedOverlayExtension(menuBottom: number, hostBottom: number): number {
  if (!Number.isFinite(menuBottom) || !Number.isFinite(hostBottom)) return 0;
  const extra = menuBottom - hostBottom;
  if (extra <= 1) return 0;
  return Math.ceil(extra);
}

/**
 * Visual iframe box for a content height plus an open overlay.
 * Layout footprint stays `height - marginBottom` (the in-flow content height).
 * Keep the loader (`search-widget/v1/loader.js` applyIframeBox) in sync.
 */
export function resolveSearchEmbedFrameBox(
  contentHeight: number,
  overlay = 0,
): { height: number; marginBottom: number } {
  const layoutHeight = clampSearchEmbedContentHeight(contentHeight);
  const extra = Number.isFinite(overlay) && overlay > 0 ? Math.ceil(overlay) : 0;
  return { height: layoutHeight + extra, marginBottom: extra };
}
