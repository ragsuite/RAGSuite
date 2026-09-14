import { resolveEmbedParentHostname } from '@/network/embed-widget-auth';

/**
 * Normalize a parent site token to a lowercase hostname for storage keys.
 * Accepts hostname or full origin URL; falls back to "local".
 */
export function normalizeEmbedSiteHost(value: string | null | undefined): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'local';

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith('//')) {
      const href = raw.startsWith('//') ? `https:${raw}` : raw;
      const host = new URL(href).hostname.trim().toLowerCase();
      if (host) return host;
    }
  } catch {
    /* ignore */
  }

  // Hostname or host:port / host/path leftovers
  const host = raw.split('/')[0]?.split(':')[0]?.trim() || '';
  return host || 'local';
}

/**
 * Resolve the embedding website host for per-site Recent / session isolation.
 * Order: explicit override → ancestor/referrer hostname → parentOrigin query → "local".
 */
export function resolveEmbedSiteHost(options?: {
  explicitHost?: string | null;
  parentOrigin?: string | null;
}): string {
  const explicit = normalizeEmbedSiteHost(options?.explicitHost);
  if (options?.explicitHost?.trim() && explicit !== 'local') {
    return explicit;
  }

  const fromFrame = resolveEmbedParentHostname();
  if (fromFrame?.trim()) {
    return normalizeEmbedSiteHost(fromFrame);
  }

  const fromQuery = normalizeEmbedSiteHost(options?.parentOrigin);
  if (options?.parentOrigin?.trim() && fromQuery !== 'local') {
    return fromQuery;
  }

  if (options?.explicitHost?.trim()) return explicit;
  return 'local';
}
