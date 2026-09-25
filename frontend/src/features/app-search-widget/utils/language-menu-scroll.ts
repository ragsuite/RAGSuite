/**
 * Whether a language-menu wheel should scroll the menu.
 * At the edges, or when every option already fits, the page should scroll instead.
 */
export function languageMenuConsumesWheel(metrics: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  deltaY: number;
}): boolean {
  const { scrollHeight, clientHeight, scrollTop, deltaY } = metrics;
  if (!Number.isFinite(deltaY) || deltaY === 0) return false;
  if (!(scrollHeight > clientHeight + 1)) return false;
  if (deltaY < 0) return scrollTop > 0;
  return scrollTop + clientHeight < scrollHeight - 1;
}
