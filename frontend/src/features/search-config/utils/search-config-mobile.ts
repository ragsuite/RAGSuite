import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

import { isSearchConfigCompactWidth, isSearchConfigWebPlatform } from '@/features/search-config/utils/search-config-layout';

export const SEARCH_CONFIG_TOUCH_MIN = 44;

/** Extra scroll padding on drill-down screens (above tab bar / home indicator). */
export const SEARCH_CONFIG_DETAIL_BOTTOM_PADDING = 72;

export function useSearchConfigCompactLayout(): boolean {
  const width = useLayoutViewportWidth();
  const isWeb = isSearchConfigWebPlatform();
  return !isWeb || isSearchConfigCompactWidth(width);
}
