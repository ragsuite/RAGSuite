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
 * Open chat uses a fullscreen transparent iframe so panel + launcher share
 * dashboard page coordinates. Backdrop only affects dimming, not cover.
 */
export function shouldCoverChatEmbedIframe(args: {
  open: boolean;
  showBackdrop?: boolean;
}): boolean {
  return Boolean(args.open);
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
