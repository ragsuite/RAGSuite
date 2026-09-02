export const PAGE_SIZE_OPTIONS = [10, 20, 25, 30, 50, 100] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/** Max numeric page buttons shown in list pagination footers. */
export const VISIBLE_PAGE_BUTTON_COUNT = 5;

export function offsetForPage(page: number, pageSize: number): number {
  const safePage = Math.max(1, page);
  return (safePage - 1) * pageSize;
}

export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0 || total <= 0) return total === 0 ? 0 : 1;
  return Math.ceil(total / pageSize);
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const maxPage = Math.max(1, pageCount(total, pageSize));
  return Math.min(Math.max(1, page), maxPage);
}

export function pageRangeStart(page: number, pageSize: number, total: number): number {
  if (total === 0) return 0;
  return offsetForPage(page, pageSize) + 1;
}

export function pageRangeEnd(page: number, pageSize: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(offsetForPage(page, pageSize) + pageSize, total);
}

export function visiblePageNumbers(
  currentPage: number,
  totalPages: number,
  maxButtons = VISIBLE_PAGE_BUTTON_COUNT,
): number[] {
  if (totalPages <= 0) return [];
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, currentPage - half);
  let end = start + maxButtons - 1;

  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - maxButtons + 1);
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
