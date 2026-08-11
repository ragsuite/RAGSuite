import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getWebFooterScrollPadding } from '@/shared/constants/web-shell-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Scroll `contentContainerStyle.paddingBottom` for screens above tab bar / web footer. */
export function useScrollBottomPadding(extra = 0): number {
  const { spacing } = useAppTheme();
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') {
    return getWebFooterScrollPadding(spacing.md, extra);
  }

  return Math.max(insets.bottom + 96, spacing.xxl) + extra;
}
