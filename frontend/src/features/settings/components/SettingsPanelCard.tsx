import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  AppCard,
  AppCardContent,
  AppCardDescription,
  AppCardHeader,
  AppCardTitle,
} from '@/shared/components/surfaces/app-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle: string;
  /** Optional control in the header (e.g. InfoHintButton). */
  trailing?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Organization Settings panel card — same header pattern as Integrations
 * (icon tile + title + subtitle) so each tab is easy to identify.
 */
export function SettingsPanelCard({ icon: Icon, title, subtitle, trailing, children, style }: Props) {
  const { colors, spacing, surfaceRadius } = useAppTheme();

  return (
    <AppCard style={style}>
      <AppCardHeader
        bordered
        style={{
          paddingTop: spacing.sm,
          paddingBottom: spacing.xs,
          paddingHorizontal: spacing.md,
          gap: spacing.xxs,
        }}>
        <View style={[styles.headerRow, trailing ? styles.headerRowWithTrailing : null]}>
          <View style={[styles.headerLeading, { gap: spacing.sm }]}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.iconWrap,
                {
                  borderRadius: surfaceRadius.button,
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                },
              ]}>
              <Icon size={18} color={colors.primary} />
            </View>
            <View style={styles.headerCopy}>
              <AppCardTitle>{title}</AppCardTitle>
              <AppCardDescription>{subtitle}</AppCardDescription>
            </View>
          </View>
          {trailing ? <View style={styles.headerTrailing}>{trailing}</View> : null}
        </View>
      </AppCardHeader>
      <AppCardContent
        flushTop
        style={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
          paddingTop: spacing.xs,
          gap: spacing.sm,
        }}>
        {children}
      </AppCardContent>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerRowWithTrailing: {
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
  },
  headerTrailing: {
    flexShrink: 0,
    alignSelf: 'center',
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
