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

/**
 * Classify why the search embed cannot paint after settings settle.
 * - `inactive` only when the API explicitly disabled search
 * - `error` for fetch failures / missing config (never treat null settings as inactive)
 */
export function resolveSearchEmbedHiddenReason(args: {
  settingsLoading: boolean;
  settingsLoadFailed: boolean;
  searchActive: boolean;
  hasSettings: boolean;
  canPaint: boolean;
}): 'inactive' | 'error' | null {
  if (args.settingsLoading || args.canPaint) return null;
  if (args.hasSettings && args.searchActive === false) return 'inactive';
  return 'error';
}
