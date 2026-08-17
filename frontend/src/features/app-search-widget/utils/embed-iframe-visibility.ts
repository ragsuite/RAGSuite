/**
 * Parent search `loader.js` keeps the host iframe invisible until branding can paint.
 *
 * Protocol (do not collapse these):
 * - `ready` — embed route hydrated; stay on AppSearch iframe (do not fall back to legacy).
 * - `resize` — search box metrics exist; parent may reveal the iframe.
 */
export function shouldRevealSearchEmbedHostIframe(messageType: string | undefined): boolean {
  return messageType === 'resize';
}

export function canPaintSearchEmbed<TConfig, TCustomization>(args: {
  settingsLoading: boolean;
  searchActive: boolean;
  config: TConfig | null | undefined;
  customization: TCustomization | null | undefined;
}): args is {
  settingsLoading: false;
  searchActive: true;
  config: TConfig;
  customization: TCustomization;
} {
  return (
    !args.settingsLoading &&
    args.searchActive &&
    args.config != null &&
    args.customization != null
  );
}
