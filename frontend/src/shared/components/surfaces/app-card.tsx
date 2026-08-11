import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type AppCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Bordered surface — brand card radius (12px) via surfaceRadius. */
export function AppCard({ children, style }: AppCardProps) {
  const { colors, surfaceRadius, elevation } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        elevation.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

type HeaderProps = {
  children: React.ReactNode;
  /** Web CardHeader uses p-6; compact = p-4 pb-3 (crawl) */
  compact?: boolean;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppCardHeader({ children, compact = false, bordered = false, style }: HeaderProps) {
  const { colors, spacing, isWebParitySurfaces } = useAppTheme();
  const horizontalPad = compact && !isWebParitySurfaces ? spacing.md : spacing.lg;
  const topPad = horizontalPad;
  const bottomPad = compact ? spacing.sm : horizontalPad;

  return (
    <View
      style={[
        {
          paddingHorizontal: horizontalPad,
          paddingTop: topPad,
          paddingBottom: bottomPad,
          gap: spacing.xs,
          borderBottomWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: colors.border,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

type TitleProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Web CardTitle text-base font-semibold (16px); native panels use slightly larger title for legibility. */
export function AppCardTitle({ children, style }: TitleProps) {
  const { colors, typography, isWebParitySurfaces } = useAppTheme();
  const fontSize = isWebParitySurfaces ? 16 : 18;

  return (
    <Text
      accessibilityRole="header"
      style={[
        typography.body,
        styles.title,
        { color: colors.text, fontSize, fontWeight: '600', lineHeight: Math.round(fontSize * 1.375) },
        style as object,
      ]}>
      {children}
    </Text>
  );
}

type DescriptionProps = {
  children: React.ReactNode;
};

export function AppCardDescription({ children }: DescriptionProps) {
  const { colors, typography } = useAppTheme();

  return (
    <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>{children}</Text>
  );
}

type ContentProps = {
  children: React.ReactNode;
  /** When true, remove top padding so list content sits flush under the header. */
  flushTop?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppCardContent({ children, flushTop = false, compact = false, style }: ContentProps) {
  const { spacing, isWebParitySurfaces } = useAppTheme();
  const pad = compact && !isWebParitySurfaces ? spacing.md : spacing.lg;
  const bottomPad = flushTop && compact && !isWebParitySurfaces ? spacing.sm : pad;

  return (
    <View
      style={[
        {
          paddingHorizontal: pad,
          paddingBottom: bottomPad,
          paddingTop: flushTop ? 0 : pad,
          gap: flushTop ? spacing.xs : spacing.sm,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

type FooterProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AppCardFooter({ children, style }: FooterProps) {
  const { spacing } = useAppTheme();

  return (
    <View
      style={[
        styles.footer,
        {
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.lg,
          paddingTop: 0,
          gap: spacing.sm,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  title: {
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
