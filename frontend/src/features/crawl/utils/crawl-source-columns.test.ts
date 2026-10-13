import {
  CRAWL_SOURCE_TABLE,
  CRAWL_SOURCES_ROW_MAIN_MIN_WIDTH,
  CRAWL_SOURCES_TABLE_MIN_WIDTH,
} from '@/features/crawl/utils/crawl-layout';
import { CRAWL_SOURCE_COLUMNS, crawlSourceColumnStyles } from '@/features/crawl/utils/crawl-source-columns';

describe('crawl source table columns', () => {
  it('styles every header column and nothing else', () => {
    expect(CRAWL_SOURCE_COLUMNS.map((column) => column.key).sort()).toEqual(
      Object.keys(crawlSourceColumnStyles).sort(),
    );
  });

  it('keeps "In answers" and the menu as the last two columns', () => {
    expect(CRAWL_SOURCE_COLUMNS.slice(-2).map((column) => column.key)).toEqual(['answers', 'actions']);
  });

  it('derives the table minimum from column minimums, gaps and edge padding', () => {
    const columnMins = CRAWL_SOURCE_COLUMNS.reduce((total, column) => {
      const style = crawlSourceColumnStyles[column.key] as { width?: number; minWidth?: number };
      return total + (style.width ?? style.minWidth ?? 0);
    }, 0);
    const gaps = (CRAWL_SOURCE_COLUMNS.length - 1) * CRAWL_SOURCE_TABLE.rowGap;
    expect(CRAWL_SOURCES_TABLE_MIN_WIDTH).toBe(columnMins + gaps + CRAWL_SOURCE_TABLE.edgePadding * 2);
  });

  it('reserves room for the answers switch and menu beside the pressable cells', () => {
    expect(
      CRAWL_SOURCES_ROW_MAIN_MIN_WIDTH +
        CRAWL_SOURCE_TABLE.answersWidth +
        CRAWL_SOURCE_TABLE.actionWidth +
        CRAWL_SOURCE_TABLE.rowGap * 2 +
        CRAWL_SOURCE_TABLE.edgePadding * 2,
    ).toBe(CRAWL_SOURCES_TABLE_MIN_WIDTH);
  });
});
