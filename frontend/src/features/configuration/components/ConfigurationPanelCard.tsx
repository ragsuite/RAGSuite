import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppCard,
  AppCardContent,
  AppCardDescription,
  AppCardHeader,
  AppCardTitle,
} from '@/shared/components/surfaces/app-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  headerAction?: React.ReactNode;
  headerBadge?: React.ReactNode;
  children: React.ReactNode;
};

/** Configuration section card — icon header + bordered body (parity with SearchConfigPanelCard). */
export function ConfigurationPanelCard({
  title,
  subtitle,
  icon: Icon,
  headerAction,
  headerBadge,
  children,
}: Props) {
  const { colors, spacing, surfaceRadius } = useAppTheme();

  return (
    <AppCard>
      <AppCardHeader
        bordered
        style={{
          paddingTop: spacing.sm,
          paddingBottom: spacing.xs,
          paddingHorizontal: spacing.md,
          gap: spacing.xxs,
        }}>
        <View style={[styles.headerRow, headerAction ? styles.headerRowWithTrailing : null]}>
          <View style={[styles.headerLeading, { gap: spacing.sm }]}>
            {Icon ? (
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
            ) : null}
            <View style={styles.headerCopy}>
              <View style={[styles.titleRow, { gap: spacing.xs }]}>
                <AppCardTitle>{title}</AppCardTitle>
                {headerBadge}
              </View>
              {subtitle ? <AppCardDescription>{subtitle}</AppCardDescription> : null}
            </View>
          </View>
          {headerAction ? <View style={styles.headerTrailing}>{headerAction}</View> : null}
        </View>
      </AppCardHeader>
      <AppCardContent
        flushTop
        style={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
          paddingTop: spacing.md,
          gap: spacing.md,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});
