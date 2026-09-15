/**
 * Normalize a parent site token for Recent / session storage keys.
 * Uses URL `.host` semantics: hostname + non-default port only
 * (e.g. localhost:9201, shop.example.com — not shop.example.com:443).
 * Accepts hostname, host:port, or full origin URL; falls back to "local".
 */
export function normalizeEmbedSiteHost(value: string | null | undefined): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'local';

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith('//')) {
      const href = raw.startsWith('//') ? `https:${raw}` : raw;
      const host = new URL(href).host.trim().toLowerCase();
      if (host) return host;
    }
  } catch {
    /* ignore */
  }

  // Bare hostname or host:port (drop path if present)
  const withoutPath = raw.split('/')[0]?.trim() || '';
  if (!withoutPath) return 'local';

  try {
    // Parse via http so URL.host keeps non-default ports (localhost:9201)
    // and omits default :80.
    const host = new URL(`http://${withoutPath}`).host.trim().toLowerCase();
    if (host) return host;
  } catch {
    /* ignore */
  }

  return withoutPath || 'local';
}

/**
 * Strip port from a storage site key for domain-allowlist / X-Request-Domain.
 */
export function hostnameFromEmbedSiteHost(siteHost: string | null | undefined): string {
  const normalized = normalizeEmbedSiteHost(siteHost);
  if (!normalized || normalized === 'local') return normalized || 'local';

  try {
    const hostname = new URL(`http://${normalized}`).hostname.trim().toLowerCase();
    if (hostname) return hostname;
  } catch {
    /* ignore */
  }

  // Fallback: drop :port (IPv6 bracket form unlikely in this path)
  const bare = normalized.split(':')[0]?.trim() || '';
  return bare || 'local';
}

/**
 * Resolve parent site host:port for storage isolation (inside the embed iframe).
 * Same sources as auth hostname helper, but returns URL `.host` (keeps non-default ports).
 */
export function resolveEmbedParentSiteHost(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList })
      .ancestorOrigins;
    if (ancestors && ancestors.length > 0) {
      const raw = String(ancestors[0] || '').trim();
      if (raw) {
        const host = new URL(raw).host.trim().toLowerCase();
        if (host) return host;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const referrer = String(document.referrer || '').trim();
    if (referrer) {
      const host = new URL(referrer).host.trim().toLowerCase();
      if (host) return host;
    }
  } catch {
    /* ignore */
  }

  try {
    if (window.parent && window.parent !== window) {
      // Same-origin parent only (preview on admin host).
      const host = String(window.parent.location.host || '').trim().toLowerCase();
      if (host) return host;
    }
  } catch {
    /* cross-origin */
  }

  return null;
}

/**
 * Resolve the embedding website host for per-site Recent / session isolation.
 * Order: explicit override → ancestor/referrer host → parentOrigin query → "local".
 */
export function resolveEmbedSiteHost(options?: {
  explicitHost?: string | null;
  parentOrigin?: string | null;
}): string {
  const explicit = normalizeEmbedSiteHost(options?.explicitHost);
  if (options?.explicitHost?.trim() && explicit !== 'local') {
    return explicit;
  }

  const fromFrame = resolveEmbedParentSiteHost();
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
