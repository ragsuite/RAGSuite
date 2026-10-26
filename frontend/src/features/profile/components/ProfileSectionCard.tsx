import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  AppCard,
  AppCardContent,
  AppCardDescription,
  AppCardFooter,
  AppCardHeader,
  AppCardTitle,
} from '@/shared/components/surfaces/app-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle: string;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Profile section card — icon tile header + padded body, optional footer. */
export function ProfileSectionCard({ icon: Icon, title, subtitle, footer, style, children }: Props) {
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
      {footer ? (
        <AppCardFooter
          style={{
            justifyContent: 'flex-end',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            paddingTop: spacing.md,
          }}>
          {footer}
        </AppCardFooter>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  headerLeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
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
