function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/** Human shortcut hint, e.g. `⌘B` on Apple and `Ctrl+B` elsewhere. */
export function shortcutLabel(key: string, shift = false): string {
  if (isApplePlatform()) return `${shift ? '⇧' : ''}⌘${key}`;
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}
