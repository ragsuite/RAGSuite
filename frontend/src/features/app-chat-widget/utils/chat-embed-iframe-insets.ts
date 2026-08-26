/**
 * Page-level iframe placement on the host document.
 * Applied by the parent loader via resize postMessage — not inside the iframe.
 */
export function resolveChatEmbedIframeOffset(args: {
  widgetBottomSpace: number;
  horizontalInset: number;
}): { offsetX: number; offsetY: number } {
  const bottomSpace = Math.max(0, Math.round(args.widgetBottomSpace || 0));
  const horizontal = Math.max(0, Math.round(args.horizontalInset || 0));
  return {
    offsetX: Math.max(horizontal, 12),
    offsetY: 12 + bottomSpace,
  };
}

/**
 * Launcher inset *inside* the embed iframe.
 * When the parent iframe already carries page offset (closed / open without cover),
 * inner bottom/side must be 0 (plus keyboard when open) so the hint is not clipped.
 * Fullscreen cover has no page offset, so page spacing applies inside.
 */
export function resolveChatEmbedInnerLauncherInset(args: {
  keyboardInset: number;
  isOpen: boolean;
  coverFullscreen?: boolean;
  widgetBottomSpace?: number;
  horizontalInset?: number;
}): { bottom: number; side: number } {
  const keyboard = Math.max(0, Math.round(args.keyboardInset || 0));
  if (args.coverFullscreen) {
    const bottomSpace = Math.max(0, Math.round(args.widgetBottomSpace || 0));
    const horizontal = Math.max(0, Math.round(args.horizontalInset || 0));
    return {
      bottom: 12 + bottomSpace + keyboard,
      side: horizontal,
    };
  }
  return {
    bottom: args.isOpen ? keyboard : 0,
    side: 0,
  };
}
