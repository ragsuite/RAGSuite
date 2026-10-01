import {
  buildGetCacheKey,
  cachedGet,
  DEFAULT_GET_CACHE_TTL_MS,
  getCacheTtlMs,
  invalidateGetCache,
  isCacheableGetConfig,
} from '@/network/get-request-cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('get-request-cache', () => {
  beforeEach(() => {
    invalidateGetCache();
    jest.useRealTimers();
  });

  it('coalesces identical in-flight requests and gives each caller its own copy', async () => {
    const pending = deferred<{ items: number[] }>();
    const fetcher = jest.fn(() => pending.promise);

    const first = cachedGet('k', 1000, fetcher);
    const second = cachedGet('k', 1000, fetcher);
    pending.resolve({ items: [3, 1, 2] });
    const [a, b] = await Promise.all([first, second]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ items: [3, 1, 2] });
    a.items.sort();
    expect(b.items).toEqual([3, 1, 2]);
  });

  it('reuses a settled response within the TTL and refetches after it', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn(async () => ({ ok: true }));

    await cachedGet('k', 1000, fetcher);
    await cachedGet('k', 1000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1001);
    await cachedGet('k', 1000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never reuses failures', async () => {
    const fetcher = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    await expect(cachedGet('k', 1000, fetcher)).rejects.toThrow('boom');
    await expect(cachedGet('k', 1000, fetcher)).resolves.toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidation drops cached and in-flight responses', async () => {
    const pending = deferred<string>();
    const fetcher = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue('fresh');

    const stale = cachedGet('k', 1000, fetcher);
    invalidateGetCache();
    const fresh = cachedGet('k', 1000, fetcher);
    pending.resolve('stale');

    await expect(stale).resolves.toBe('stale');
    await expect(fresh).resolves.toBe('fresh');
    await expect(cachedGet('k', 1000, fetcher)).resolves.toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keys by auth token, url and params', () => {
    const base = buildGetCacheKey('/api/v1/x', { a: 1 }, 'tok-a');
    expect(buildGetCacheKey('/api/v1/x', { a: 1 }, 'tok-b')).not.toBe(base);
    expect(buildGetCacheKey('/api/v1/x', { a: 2 }, 'tok-a')).not.toBe(base);
    expect(buildGetCacheKey('/api/v1/y', { a: 1 }, 'tok-a')).not.toBe(base);
    expect(buildGetCacheKey('/api/v1/x', { a: 1 }, 'tok-a')).toBe(base);
  });

  it('only caches plain GET configs', () => {
    expect(isCacheableGetConfig(undefined)).toBe(true);
    expect(isCacheableGetConfig({ params: { q: 1 } })).toBe(true);
    expect(isCacheableGetConfig({ noDedupe: true })).toBe(false);
    expect(isCacheableGetConfig({ signal: new AbortController().signal })).toBe(false);
    expect(isCacheableGetConfig({ responseType: 'blob' })).toBe(false);
    expect(isCacheableGetConfig({ headers: { X: '1' } })).toBe(false);
  });

  it('uses a longer TTL only for slow-changing endpoints', () => {
    expect(getCacheTtlMs('http://h:9090/api/v1/user/profile')).toBe(30_000);
    expect(getCacheTtlMs('http://h:9090/api/v1/user/2fa/status')).toBe(30_000);
    expect(getCacheTtlMs('http://h:9090/api/v1/user/profile/password')).toBe(DEFAULT_GET_CACHE_TTL_MS);
    expect(getCacheTtlMs('http://h:9090/api/v1/crawl/sites?project_id=1')).toBe(DEFAULT_GET_CACHE_TTL_MS);
  });
});
