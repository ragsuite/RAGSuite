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
  trailing?: React.ReactNode;
  headerBadge?: React.ReactNode;
  children: React.ReactNode;
  /** Merged onto the outer AppCard (e.g. overflow: 'visible' for sticky children). */
  style?: StyleProp<ViewStyle>;
  /** Skip card chrome when already inside another panel (avoids nested backgrounds). */
  flat?: boolean;
};

/** Reference web card: icon + title + subtitle header, bordered body. */
export function SearchConfigPanelCard({
  icon: Icon,
  title,
  subtitle,
  trailing,
  headerBadge,
  children,
  style,
  flat = false,
}: Props) {
  const { colors, spacing, surfaceRadius } = useAppTheme();

  const header = (
    <AppCardHeader
      bordered={!flat}
      style={{
        paddingTop: flat ? 0 : spacing.sm,
        paddingBottom: spacing.xs,
        paddingHorizontal: flat ? 0 : spacing.md,
        gap: spacing.xxs,
      }}>
      <View style={[styles.headerRow, trailing ? styles.headerRowWithTrailing : null]}>
        <View style={[styles.headerLeading, { gap: spacing.sm }]}>
          <View
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
            <View style={[styles.titleRow, { gap: spacing.xs }]}>
              <AppCardTitle>{title}</AppCardTitle>
              {headerBadge}
            </View>
            <AppCardDescription>{subtitle}</AppCardDescription>
          </View>
        </View>
        {trailing ? <View style={styles.headerTrailing}>{trailing}</View> : null}
      </View>
    </AppCardHeader>
  );

  const body = (
    <AppCardContent
      flushTop
      style={{
        paddingHorizontal: flat ? 0 : spacing.md,
        paddingBottom: flat ? 0 : spacing.md,
        paddingTop: spacing.xs,
        gap: spacing.sm,
      }}>
      {children}
    </AppCardContent>
  );

  if (flat) {
    return (
      <View style={[{ gap: spacing.sm }, style]}>
        {header}
        {body}
      </View>
    );
  }

  return (
    <AppCard style={style}>
      {header}
      {body}
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
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  headerTrailing: {
    flexShrink: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
