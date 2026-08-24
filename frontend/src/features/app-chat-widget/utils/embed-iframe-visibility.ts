/**
 * Parent `loader.js` keeps the host iframe invisible until branding can paint.
 *
 * Protocol (do not collapse these):
 * - `ready` — embed route hydrated; stay on AppChat iframe (do not fall back to legacy).
 * - `resize` — launcher metrics exist; parent may reveal the iframe.
 */
export function shouldRevealEmbedHostIframe(messageType: string | undefined): boolean {
  return messageType === 'resize';
}

/**
 * Fullscreen iframe only when open *and* backdrop is on.
 * Without backdrop, a tight corner iframe is required — a transparent full-page
 * iframe always steals host clicks (pointer-events inside the iframe cannot fix that).
 */
export function shouldCoverChatEmbedIframe(args: {
  open: boolean;
  showBackdrop?: boolean;
}): boolean {
  return Boolean(args.open && args.showBackdrop);
}

export function canPaintEmbedLauncher<TConfig, TCustomization>(args: {
  settingsLoading: boolean;
  chatbotActive: boolean;
  config: TConfig | null | undefined;
  displayCustomization: TCustomization | null | undefined;
}): args is {
  settingsLoading: false;
  chatbotActive: true;
  config: TConfig;
  displayCustomization: TCustomization;
} {
  return (
    !args.settingsLoading &&
    args.chatbotActive &&
    args.config != null &&
    args.displayCustomization != null
  );
}
