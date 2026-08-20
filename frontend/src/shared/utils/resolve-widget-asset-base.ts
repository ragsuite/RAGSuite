/**
 * Origin that hosts `/widget/v1/ragsuite-init.js`
 * (reference EmbeddableWidget / ChatbotConfiguration: `window.location.origin`).
 *
 * Kept in its own module so Metro HMR cannot drop this named export from a
 * larger util file mid-update (avoids "resolveWidgetAssetBase is not a function").
 */

/**
 * Ensure a host or URL is absolute for embed snippets / loaders.
 * Bare hosts (`example.com` / `example.com/path`) become `https://…`.
 * Existing `http(s):` and protocol-relative (`//`) values are preserved.
 */
export function ensureAbsoluteHttpUrl(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith('//')) {
    return value.replace(/\/+$/, '');
  }
  return `https://${value.replace(/^\/+/, '')}`.replace(/\/+$/, '');
}

export function resolveWidgetAssetBase(options?: {
  configuredBase?: string | null;
  pageOrigin?: string | null;
  apiBaseUrl?: string | null;
}): string {
  const configured = ensureAbsoluteHttpUrl(options?.configuredBase);
  if (configured) return configured;

  const pageOrigin = ensureAbsoluteHttpUrl(options?.pageOrigin);
  if (pageOrigin) return pageOrigin;

  const api = String(options?.apiBaseUrl || '').trim();
  if (api) {
    try {
      return new URL(ensureAbsoluteHttpUrl(api) || api).origin;
    } catch {
      // fall through
    }
  }

  return 'http://localhost';
}
