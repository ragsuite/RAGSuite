/**
 * Resolve widget cache-bust for ragsuite-init.js (keep in sync with init logic).
 * `latest` and known stale values map to WIDGET_ASSET_VERSION.
 */
export function resolveWidgetCacheBustValue(
  rawCacheBust: string | null | undefined,
  widgetAssetVersion: string,
  staleCacheBusts: Record<string, boolean>,
): string {
  const normalized = rawCacheBust != null ? String(rawCacheBust).trim() : '';
  if (
    !normalized ||
    normalized.toLowerCase() === 'latest' ||
    staleCacheBusts[normalized]
  ) {
    return widgetAssetVersion;
  }
  return normalized;
}
