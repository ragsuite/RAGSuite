import { Platform } from 'react-native';

import { CRAWL_COMPACT_BREAKPOINT } from '@/features/crawl/utils/crawl-layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

/** Minimum touch target per WCAG / iOS HIG (44pt). */
export const CRAWL_MOBILE_TOUCH_MIN = 44;

/** Native app layouts only (not responsive web). */
export function isCrawlMobileLayout(): boolean {
  return Platform.OS !== 'web';
}

/** Native mobile or narrow web — card rows, collapsible filters, bottom sheets. */
export function useCrawlCompactLayout(): boolean {
  const width = useLayoutViewportWidth();
  if (Platform.OS !== 'web') return true;
  return width < CRAWL_COMPACT_BREAKPOINT;
}
