/**
 * Widget auth headers for public `/embed/chatbot` and `/embed/search` iframes.
 * Parent page domain is captured from ancestorOrigins / document.referrer (not query params).
 */

let embedWidgetAuth: { projectId: string; requestDomain: string } | null = null;

export function configureEmbedWidgetAuth(input: {
  projectId: string;
  requestDomain: string;
} | null): void {
  if (!input?.projectId?.trim() || !input?.requestDomain?.trim()) {
    embedWidgetAuth = null;
    return;
  }
  embedWidgetAuth = {
    projectId: input.projectId.trim(),
    requestDomain: input.requestDomain.trim().toLowerCase(),
  };
}

export function getEmbedWidgetAuthHeaders(): Record<string, string> {
  if (!embedWidgetAuth) return {};
  return {
    'X-Project-ID': embedWidgetAuth.projectId,
    'X-Request-Domain': embedWidgetAuth.requestDomain,
    'X-Widget-Mode': 'true',
  };
}

/** Resolve the embedding page hostname from inside the iframe. */
export function resolveEmbedParentHostname(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList })
      .ancestorOrigins;
    if (ancestors && ancestors.length > 0) {
      const raw = String(ancestors[0] || '').trim();
      if (raw) return new URL(raw).hostname || null;
    }
  } catch {
    /* ignore */
  }
  try {
    const referrer = String(document.referrer || '').trim();
    if (referrer) return new URL(referrer).hostname || null;
  } catch {
    /* ignore */
  }
  try {
    if (window.parent && window.parent !== window) {
      // Same-origin parent only (preview on admin host).
      return window.parent.location.hostname || null;
    }
  } catch {
    /* cross-origin */
  }
  return null;
}
