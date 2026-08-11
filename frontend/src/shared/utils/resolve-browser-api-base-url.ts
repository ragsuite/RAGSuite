/**
 * Resolve public API base for widget embeds — parity with reference
 * `client/src/utils/publicApiBaseUrl.ts` (`resolveBrowserApiBaseUrl`).
 */

import { env } from '@/config/env';

const DEV_FRONTEND_PORTS = new Set(['3000', '5173', '5174', '6173', '9091', '9191']);
const DEFAULT_API_PATH = '/api/v1';
const DEFAULT_DEV_BACKEND_PORT = '9090';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveDevBackendPort(): string {
  try {
    const raw = String(env.apiBaseUrl || '').trim();
    if (raw) {
      const port = new URL(raw).port;
      if (port) return port;
    }
  } catch {
    // Fall through to stack default.
  }
  return DEFAULT_DEV_BACKEND_PORT;
}

function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase().trim();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    return true;
  }
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  return false;
}

function coerceDevFrontendPort(url: URL): URL {
  if (!DEV_FRONTEND_PORTS.has(url.port || '')) {
    return url;
  }
  const next = new URL(url.toString());
  next.port = resolveDevBackendPort();
  if (!next.pathname || next.pathname === '/') {
    next.pathname = DEFAULT_API_PATH;
  }
  return next;
}

function toAbsoluteUrl(raw: string, fallbackOrigin: string): URL | null {
  try {
    return new URL(raw, fallbackOrigin);
  } catch {
    return null;
  }
}

function rewriteApiUrlToOrigin(resolved: URL, origin: string, defaultPath: string): URL {
  const next = new URL(resolved.pathname || defaultPath, origin);
  if (!next.pathname || next.pathname === '/') {
    next.pathname = defaultPath;
  }
  return next;
}

function urlLooksPrivateOrDev(url: URL): boolean {
  return isPrivateOrLoopbackHostname(url.hostname) || DEV_FRONTEND_PORTS.has(url.port || '');
}

function urlLooksPublic(url: URL): boolean {
  return !isPrivateOrLoopbackHostname(url.hostname) && !DEV_FRONTEND_PORTS.has(url.port || '');
}

export function resolveBrowserApiBaseUrl(
  rawCandidate?: string | null,
  options?: {
    pageOrigin?: string | null;
    assetOrigin?: string | null;
    defaultPath?: string;
  },
): string {
  const pageOrigin = options?.pageOrigin || '';
  const assetOrigin = options?.assetOrigin || pageOrigin;
  const defaultPath = options?.defaultPath || DEFAULT_API_PATH;
  const fallbackOrigin = assetOrigin || pageOrigin || 'http://localhost';
  const fallbackUrl = `${trimTrailingSlash(fallbackOrigin)}${defaultPath}`;
  const candidate = String(rawCandidate || '').trim() || fallbackUrl;

  let resolved = toAbsoluteUrl(candidate, fallbackOrigin);
  if (!resolved) {
    return fallbackUrl;
  }

  resolved = coerceDevFrontendPort(resolved);

  const preferredOriginUrl =
    toAbsoluteUrl(assetOrigin || '', fallbackOrigin) || toAbsoluteUrl(pageOrigin || '', fallbackOrigin);

  if (urlLooksPrivateOrDev(resolved) && preferredOriginUrl && urlLooksPublic(preferredOriginUrl)) {
    resolved = rewriteApiUrlToOrigin(resolved, preferredOriginUrl.origin, defaultPath);
  }

  const currentPageUrl = toAbsoluteUrl(pageOrigin || '', fallbackOrigin);
  if (
    currentPageUrl?.protocol === 'https:' &&
    resolved.protocol === 'http:' &&
    preferredOriginUrl?.protocol === 'https:'
  ) {
    resolved = rewriteApiUrlToOrigin(resolved, preferredOriginUrl.origin, defaultPath);
  }

  const normalizedPath = String(resolved.pathname || '').replace(/\/+$/, '');
  if (!normalizedPath || normalizedPath === '/') {
    resolved.pathname = defaultPath;
  }

  return trimTrailingSlash(resolved.toString());
}

export { resolveWidgetAssetBase } from '@/shared/utils/resolve-widget-asset-base';
