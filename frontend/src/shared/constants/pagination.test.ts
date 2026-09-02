import {
  clampPage,
  offsetForPage,
  pageCount,
  pageRangeEnd,
  pageRangeStart,
  visiblePageNumbers,
} from '@/shared/constants/pagination';

describe('pagination constants', () => {
  it('computes offset for page', () => {
    expect(offsetForPage(1, 25)).toBe(0);
    expect(offsetForPage(3, 25)).toBe(50);
  });

  it('computes page count', () => {
    expect(pageCount(0, 25)).toBe(0);
    expect(pageCount(1, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });

  it('clamps page within bounds', () => {
    expect(clampPage(0, 100, 25)).toBe(1);
    expect(clampPage(99, 100, 25)).toBe(4);
  });

  it('computes visible range labels', () => {
    expect(pageRangeStart(2, 25, 100)).toBe(26);
    expect(pageRangeEnd(2, 25, 100)).toBe(50);
  });

  it('builds visible page number window', () => {
    expect(visiblePageNumbers(3, 10, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(visiblePageNumbers(8, 10, 5)).toEqual([6, 7, 8, 9, 10]);
    expect(visiblePageNumbers(1, 30)).toEqual([1, 2, 3, 4, 5]);
    expect(visiblePageNumbers(9, 30)).toEqual([7, 8, 9, 10, 11]);
    expect(visiblePageNumbers(30, 30)).toEqual([26, 27, 28, 29, 30]);
    expect(visiblePageNumbers(1, 3)).toEqual([1, 2, 3]);
  });
});
