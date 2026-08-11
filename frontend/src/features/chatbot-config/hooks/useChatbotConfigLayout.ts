import { Platform } from 'react-native';

import {
  CHATBOT_CONFIG_COMPACT_BREAKPOINT,
  isChatbotConfigWebPlatform,
} from '@/features/chatbot-config/utils/chatbot-config-layout';
import {
  CONFIG_MODULE_SIDEBAR_BREAKPOINT,
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
} from '@/shared/constants/layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

export function useChatbotConfigLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = isChatbotConfigWebPlatform();
  const isNativeMobile = Platform.OS !== 'web';
  const isCompact = isNativeMobile || (isWeb && width < CHATBOT_CONFIG_COMPACT_BREAKPOINT);
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
