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

/**
 * Keep the host shell in fullscreen cover for the whole open→exit session.
 * Once close is committed (intentional closed resize posted), never re-arm cover
 * even if React still reports `isPanelAnimating` — that gap caused fullscreen↔corner thrash.
 */
export function shouldKeepChatEmbedCoverSession(args: {
  showBackdrop: boolean;
  closeCommitted: boolean;
  isOpen: boolean;
  isPanelAnimating: boolean;
  coverSessionActive: boolean;
}): boolean {
  if (!args.showBackdrop || args.closeCommitted) return false;
  return args.isOpen || args.isPanelAnimating || args.coverSessionActive;
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
