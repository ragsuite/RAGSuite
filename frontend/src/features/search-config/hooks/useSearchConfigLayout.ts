import { Platform } from 'react-native';

import {
  SEARCH_CONFIG_COMPACT_BREAKPOINT,
  isSearchConfigWebPlatform,
} from '@/features/search-config/utils/search-config-layout';
import {
  CONFIG_MODULE_SIDEBAR_BREAKPOINT,
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
} from '@/shared/constants/layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

export function useSearchConfigLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = isSearchConfigWebPlatform();
  const isNativeMobile = Platform.OS !== 'web';
  const isCompact = isNativeMobile || (isWeb && width < SEARCH_CONFIG_COMPACT_BREAKPOINT);
  const showSettingsSidebar = isWeb && width >= CONFIG_MODULE_SIDEBAR_BREAKPOINT;
  const showHistorySplit = isWeb && width >= CONFIG_MODULE_SIDEBAR_BREAKPOINT;

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompact,
    showSettingsSidebar,
    showHistorySplit,
    contentMaxWidth: isWeb ? getFeatureContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getFeatureHorizontalPadding(width) : undefined,
  };
}
