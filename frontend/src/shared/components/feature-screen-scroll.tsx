import React from 'react';
import {
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppKeyboardAvoiding } from '@/shared/components/app-keyboard-avoiding';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { getWebFooterScrollPadding } from '@/shared/constants/web-shell-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  children: React.ReactNode;
  header?: React.ReactNode;
  backgroundColor: string;
  contentMaxWidth?: number;
  horizontalPadding: number;
  topPadding?: number;
  bottomPaddingExtra?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  /** Keep header fixed while body scrolls (recommended for tabbed screens). */
  stickyHeader?: boolean;
  /**
   * Hairline under sticky tabs + extra content offset.
   * Opt-in for Chatbot / Search configuration only — elsewhere it adds clutter.
   */
  stickyHeaderDivider?: boolean;
};

/**
 * Feature screens: AppKeyboardAvoiding owns keyboard (iOS / Android modal).
 * Scroll views disable automaticallyAdjustKeyboardInsets to avoid double padding.
 */
export function FeatureScreenScroll({
  children,
  header,
  backgroundColor,
  contentMaxWidth,
  horizontalPadding,
  topPadding = 0,
  bottomPaddingExtra = 0,
  refreshing = false,
  onRefresh,
  contentStyle,
  stickyHeader = true,
  stickyHeaderDivider = false,
}: Props) {
  const { colors, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const bottomPadding = isWeb
    ? getWebFooterScrollPadding(spacing.md, bottomPaddingExtra)
    : Math.max(insets.bottom + 96, spacing.xxl) + bottomPaddingExtra;

  const shellStyle = {
    paddingHorizontal: horizontalPadding,
    maxWidth: contentMaxWidth,
    alignSelf: contentMaxWidth ? ('center' as const) : undefined,
    width: contentMaxWidth ? ('100%' as const) : undefined,
  };

  const stickyContentTop = stickyHeaderDivider ? spacing.lg + spacing.xs : spacing.md;

  const scrollContentStyle = [
    styles.scrollContent,
    shellStyle,
    {
      paddingTop: header && stickyHeader ? stickyContentTop : topPadding,
      paddingBottom: bottomPadding,
      gap: spacing.lg,
    },
    contentStyle,
  ];

  const refreshControl =
    onRefresh != null ? (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
    ) : undefined;

  if (header && stickyHeader) {
    return (
      <AppKeyboardAvoiding style={[styles.root, { backgroundColor, minHeight: 0 }]} surface="screen">
        <View
          style={[
            styles.headerShell,
            shellStyle,
            {
              paddingTop: topPadding,
              paddingBottom: stickyHeaderDivider ? spacing.md : 0,
              gap: spacing.md,
              backgroundColor,
              zIndex: stickyHeaderDivider ? 3 : 2,
              ...(stickyHeaderDivider
                ? {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }
                : null),
            },
          ]}>
          {header}
        </View>
        <AppScrollView
          style={[styles.flex, { minHeight: 0 }]}
          automaticallyAdjustKeyboardInsets={false}
          refreshControl={refreshControl}
          contentContainerStyle={scrollContentStyle}>
          {children}
        </AppScrollView>
      </AppKeyboardAvoiding>
    );
  }

  return (
    <AppKeyboardAvoiding style={[styles.root, { backgroundColor, minHeight: 0 }]} surface="screen">
      <AppScrollView
        style={styles.flex}
        automaticallyAdjustKeyboardInsets={false}
        refreshControl={refreshControl}
        contentContainerStyle={[
          scrollContentStyle,
          header ? { paddingTop: topPadding, gap: spacing.md } : null,
        ]}>
        {header}
        {children}
      </AppScrollView>
    </AppKeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  headerShell: {
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
  },
});
