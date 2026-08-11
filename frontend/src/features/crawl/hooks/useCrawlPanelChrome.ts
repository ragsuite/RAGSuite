import type { ViewStyle } from 'react-native';

import { isCrawlMobileLayout } from '@/features/crawl/utils/crawl-mobile';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/**
 * Mobile-only crawl panel spacing: avoid double padding inside AppCardContent
 * and separate stacked connector sections more clearly.
 */
export function useCrawlPanelChrome() {
  const { spacing } = useAppTheme();
  const isMobile = isCrawlMobileLayout();

  const sectionStackStyle: ViewStyle = {
    gap: isMobile ? spacing.lg : spacing.md,
  };

  /** Inner body under CrawlPanelCard — AppCardContent already pads on all platforms. */
  const panelBodyStyle: ViewStyle = isMobile
    ? { gap: spacing.sm }
    : { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md };

  const panelBodyLooseStyle: ViewStyle = isMobile
    ? { gap: spacing.sm }
    : { gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md };

  const listRowStyle: ViewStyle = isMobile
    ? { paddingHorizontal: 10, paddingVertical: 8 }
    : { paddingHorizontal: 12, paddingVertical: 10 };

  const statCardStyle: ViewStyle = isMobile
    ? { padding: 10, gap: 2 }
    : { padding: 12, gap: 4 };

  const emptyConnectStyle: ViewStyle = isMobile
    ? { paddingBottom: spacing.xs }
    : { paddingHorizontal: spacing.md, paddingBottom: spacing.sm };

  return {
    isMobile,
    sectionStackStyle,
    panelBodyStyle,
    panelBodyLooseStyle,
    listRowStyle,
    statCardStyle,
    emptyConnectStyle,
  };
}
