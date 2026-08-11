import { Platform } from 'react-native';

import {
  CRAWL_COMPACT_BREAKPOINT,
  CRAWL_HEADER_STACK_BREAKPOINT,
  CRAWL_TABLE_MIN_WIDTH,
  CRAWL_TABLE_SCROLL_BREAKPOINT,
  getCrawlContentMaxWidth,
  getCrawlHorizontalPadding,
  isCrawlWebPlatform,
} from '@/features/crawl/utils/crawl-layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

export function useCrawlLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = isCrawlWebPlatform();
  const isNativeMobile = Platform.OS !== 'web';
  const isCompact = isNativeMobile || (isWeb && width < CRAWL_COMPACT_BREAKPOINT);
  const isCompactWeb = isWeb && width < CRAWL_COMPACT_BREAKPOINT;
  const isHeaderStacked = (isWeb && width < CRAWL_HEADER_STACK_BREAKPOINT) || isNativeMobile;
  const showSourceTable = isWeb && !isCompact;
  const showJobsTable = isWeb;
  const useTableHorizontalScroll = showSourceTable && width < CRAWL_TABLE_SCROLL_BREAKPOINT;
  const useJobsTableHorizontalScroll = showJobsTable && width < CRAWL_TABLE_SCROLL_BREAKPOINT;
  const isTabsEqualWidth = isNativeMobile || isCompactWeb;
  const showWebPageHeader = isWeb;
  const isCompactWebHeader = isCompactWeb;

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompact,
    isCompactWeb,
    isHeaderStacked,
    showSourceTable,
    showJobsTable,
    useTableHorizontalScroll,
    useJobsTableHorizontalScroll,
    isTabsEqualWidth,
    showWebPageHeader,
    isCompactWebHeader,
    contentMaxWidth: isWeb ? getCrawlContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getCrawlHorizontalPadding(width) : undefined,
    tableMinWidth: CRAWL_TABLE_MIN_WIDTH,
  };
}
