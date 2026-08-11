/**
 * Origin that hosts `/widget/v1/ragsuite-init.js`
 * (reference EmbeddableWidget / ChatbotConfiguration: `window.location.origin`).
 *
 * Kept in its own module so Metro HMR cannot drop this named export from a
 * larger util file mid-update (avoids "resolveWidgetAssetBase is not a function").
 */
export function resolveWidgetAssetBase(options?: {
  configuredBase?: string | null;
  pageOrigin?: string | null;
  apiBaseUrl?: string | null;
}): string {
  const configured = String(options?.configuredBase || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  const pageOrigin = String(options?.pageOrigin || '').trim().replace(/\/+$/, '');
  if (pageOrigin) return pageOrigin;

  const api = String(options?.apiBaseUrl || '').trim();
  if (api) {
    try {
      return new URL(api).origin;
    } catch {
      // fall through
    }
  }

  return 'http://localhost';
}
