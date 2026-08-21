/**
 * Search loader mountTo helper (mirrors search-widget/v1/loader.js).
 * Relocating an iframe may reload its content; destroy() is still required before full re-inject.
 */
export function resolveSearchMountTarget(
  selector: string,
  querySelector: (sel: string) => Element | null,
  isSafeBodyMountParent: (parent: Element | null) => boolean,
): Element | null {
  const sel = String(selector || '').trim();
  if (!sel) return null;
  const target = querySelector(sel);
  if (!target || !isSafeBodyMountParent(target)) return null;
  return target;
}

export function shouldRelocateIframe(iframe: { parentNode: Element | null }, target: Element): boolean {
  return iframe.parentNode !== target;
}
