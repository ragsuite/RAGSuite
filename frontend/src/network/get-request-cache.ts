import type { AxiosRequestConfig } from 'axios';

/**
 * Coalesces identical concurrent GETs and briefly reuses successful responses, so
 * screens that mount several consumers of the same endpoint send one request.
 *
 * Any mutation (POST/PUT/PATCH/DELETE/upload) clears everything, including GETs
 * still in flight, so a read never returns data from before a write.
 */

/** Must stay below the fastest poll interval in the app (1.2s reindex banners). */
export const DEFAULT_GET_CACHE_TTL_MS = 1_000;
const SLOW_CHANGING_TTL_MS = 30_000;

const SLOW_CHANGING_PATHS: readonly RegExp[] = [
  /\/api\/v1\/user\/profile$/,
  /\/api\/v1\/user\/2fa\/status$/,
  /\/api\/v1\/config-models\/models$/,
  /\/api\/v1\/integrations\/embed$/,
  /\/api\/v1\/avatars$/,
];

/** Config keys that do not change the response; anything else bypasses the cache. */
const CACHEABLE_CONFIG_KEYS = new Set(['params']);

type Entry = {
  promise: Promise<unknown>;
  generation: number;
  settledAt: number | null;
  ttlMs: number;
};

const entries = new Map<string, Entry>();
let generation = 0;

export function getCacheTtlMs(url: string): number {
  const path = url.split('?')[0] ?? url;
  return SLOW_CHANGING_PATHS.some((pattern) => pattern.test(path))
    ? SLOW_CHANGING_TTL_MS
    : DEFAULT_GET_CACHE_TTL_MS;
}

export function isCacheableGetConfig(config?: AxiosRequestConfig & { noDedupe?: boolean }): boolean {
  if (!config) return true;
  return Object.entries(config).every(
    ([key, value]) => value === undefined || CACHEABLE_CONFIG_KEYS.has(key),
  );
}

export function buildGetCacheKey(url: string, params: unknown, authToken: string | null): string {
  return `${authToken ?? ''}\u0000${url}\u0000${params === undefined ? '' : JSON.stringify(params)}`;
}

function cloneData<T>(data: T): T {
  if (data === null || typeof data !== 'object') return data;
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data)) as T;
}

function isFresh(entry: Entry, now: number): boolean {
  return entry.settledAt === null || now - entry.settledAt < entry.ttlMs;
}

/**
 * Returns the shared in-flight or recently settled response for ``key``; otherwise
 * runs ``fetcher``. Every caller gets its own copy so in-place edits (e.g. sorting
 * a list) never leak between consumers. Failed requests are never reused.
 */
export function cachedGet<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.generation === generation && isFresh(existing, now)) {
    return (existing.promise as Promise<T>).then(cloneData);
  }

  const entry: Entry = { promise: Promise.resolve(), generation, settledAt: null, ttlMs };
  const promise = fetcher().then(
    (data) => {
      if (entries.get(key) === entry) {
        if (entry.generation === generation && ttlMs > 0) {
          entry.settledAt = Date.now();
        } else {
          entries.delete(key);
        }
      }
      return data;
    },
    (error: unknown) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    },
  );
  entry.promise = promise;
  entries.set(key, entry);
  return promise.then(cloneData);
}

export function invalidateGetCache(): void {
  generation += 1;
  entries.clear();
}

/** Call when a request starts and when it finishes; only writes clear the cache. */
export function invalidateGetCacheForWrite(method: string | undefined): void {
  const normalized = (method ?? 'get').toLowerCase();
  if (normalized !== 'get' && normalized !== 'head' && normalized !== 'options') {
    invalidateGetCache();
  }
}
