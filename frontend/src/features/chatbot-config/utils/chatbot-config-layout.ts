import { Platform } from 'react-native';

import { COMPACT_LAYOUT_BREAKPOINT } from '@/shared/constants/layout';

/** @deprecated Use COMPACT_LAYOUT_BREAKPOINT from @/shared/constants/layout */
export const CHATBOT_CONFIG_COMPACT_BREAKPOINT = COMPACT_LAYOUT_BREAKPOINT;

export function isChatbotConfigWebPlatform() {
  return Platform.OS === 'web';
}
