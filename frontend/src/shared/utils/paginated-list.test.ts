import {
  advanceFetchCursor,
  mergePage,
  pageAddedNewItems,
  resolveHasMore,
} from '@/shared/hooks/use-paginated-offset';
import { appendUniqueById, deriveOffsetPagination } from '@/shared/utils/paginated-list';

describe('appendUniqueById', () => {
  it('appends new items by id', () => {
    const current = [{ id: 'a' }, { id: 'b' }];
    const incoming = [{ id: 'c' }];
    expect(appendUniqueById(current, incoming, (item) => item.id)).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('skips duplicate ids from incoming pages', () => {
    const current = [{ id: 'a' }, { id: 'b' }];
    const incoming = [{ id: 'b' }, { id: 'c' }];
    expect(appendUniqueById(current, incoming, (item) => item.id)).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('returns a copy when incoming is empty', () => {
    const current = [{ id: 'a' }];
    const merged = appendUniqueById(current, [], (item) => item.id);
    expect(merged).toEqual(current);
    expect(merged).not.toBe(current);
  });
});

describe('pageAddedNewItems', () => {
  it('returns true when merged list grew', () => {
    expect(pageAddedNewItems(30, 60)).toBe(true);
  });

  it('returns false when no new unique rows were added', () => {
    expect(pageAddedNewItems(60, 60)).toBe(false);
  });
});

describe('mergePage', () => {
  it('delegates to appendUniqueById', () => {
    const current = [{ id: 'a' }];
    const incoming = [{ id: 'b' }];
    expect(mergePage(current, incoming, (item) => item.id)).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
  });
});

describe('advanceFetchCursor', () => {
  it('advances by page length independently of deduped list size', () => {
    expect(advanceFetchCursor(90, 30)).toBe(120);
  });
});

describe('resolveHasMore', () => {
  it('stays true when fetch cursor is below api total', () => {
    expect(
      resolveHasMore({
        fetchCursor: 120,
        apiTotal: 374,
        pageLength: 30,
      }),
    ).toBe(true);
  });

  it('is false when fetch cursor reached api total', () => {
    expect(
      resolveHasMore({
        fetchCursor: 374,
        apiTotal: 374,
        pageLength: 14,
      }),
    ).toBe(false);
  });

  it('is false when the page is empty', () => {
    expect(
      resolveHasMore({
        fetchCursor: 90,
        apiTotal: 374,
        pageLength: 0,
      }),
    ).toBe(false);
  });
});

describe('deriveOffsetPagination', () => {
  it('uses api total when provided', () => {
    expect(
      deriveOffsetPagination({
        mergedLength: 40,
        pageLength: 20,
        limit: 20,
        apiTotal: 374,
      }),
    ).toEqual({ hasMore: true, total: 374 });
  });

  it('marks hasMore false when merged length reaches api total', () => {
    expect(
      deriveOffsetPagination({
        mergedLength: 374,
        pageLength: 14,
        limit: 30,
        apiTotal: 374,
      }),
    ).toEqual({ hasMore: false, total: 374 });
  });

  it('falls back to page size when api total is missing', () => {
    expect(
      deriveOffsetPagination({
        mergedLength: 40,
        pageLength: 20,
        limit: 20,
      }),
    ).toEqual({ hasMore: true, total: 40 });
  });

  it('falls back to merged length when final page is partial', () => {
    expect(
      deriveOffsetPagination({
        mergedLength: 41,
        pageLength: 1,
        limit: 20,
      }),
    ).toEqual({ hasMore: false, total: 41 });
  });
});
