import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Variant = 'page' | 'section' | 'compact' | 'compactPage' | 'list';

type Props = {
  title: string;
  subtitle?: string;
  /** page / compactPage / compact = screen h1 (same size); section = in-content h2 */
  variant?: Variant;
  /** Optional icon or badge before title (Audit shield, notifications bell). */
  leading?: React.ReactNode;
  /** Optional node after title on the title row (e.g. unread badge). */
  titleAddon?: React.ReactNode;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Screen-level page titles share one spec; section titles are one step smaller. */
function isScreenTitleVariant(variant: Variant): boolean {
  return variant === 'page' || variant === 'compactPage' || variant === 'compact';
}

/** In-content page/section headers — consistent screen title size across all routes. */
export function PageSectionHeader({ title, subtitle, variant = 'page', leading, titleAddon, action, style }: Props) {
  const { colors, spacing, typography, isWebParitySurfaces } = useAppTheme();
  const isScreenTitle = isScreenTitleVariant(variant);
  const isListSection = variant === 'list';

  const titleTypography = isListSection
    ? typography.listSectionTitle
    : isScreenTitle
      ? typography.pageDisplay
      : typography.sectionDisplay;
  const fontSize = isListSection
    ? undefined
    : isScreenTitle
      ? isWebParitySurfaces
        ? 24
        : 18
      : isWebParitySurfaces
        ? 22
        : 18;
  const letterSpacing = isListSection ? undefined : isScreenTitle ? -0.5 : -0.35;
  const fontWeight = isListSection ? undefined : isScreenTitle ? ('500' as const) : ('600' as const);
  const subtitleTypography = isListSection ? typography.listSectionDescription : typography.body;

  const rowSpacing = isListSection
    ? { gap: 0, marginTop: 0, marginBottom: 0 }
    : { gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm };

  return (
    <View style={[styles.row, rowSpacing, style]}>
      <View
        style={[styles.copy, isListSection ? { gap: spacing.xxs } : null]}
        accessibilityRole="header">
        <View style={[styles.titleRow, { gap: spacing.sm }]}>
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <Text
            style={[
              titleTypography,
              {
                color: colors.text,
                ...(fontSize != null ? { fontSize } : null),
                ...(fontWeight != null ? { fontWeight } : null),
                ...(letterSpacing != null ? { letterSpacing } : null),
                ...(fontSize != null ? { lineHeight: Math.round(fontSize * 1.15) } : null),
                flexShrink: 1,
              },
            ]}>
            {title}
          </Text>
          {titleAddon ? <View style={styles.leading}>{titleAddon}</View> : null}
        </View>
        {subtitle ? (
          <Text
            style={[
              subtitleTypography,
              {
                color: colors.textMuted,
                ...(isListSection ? null : { marginTop: 4 }),
                maxWidth: isWebParitySurfaces ? 768 : undefined,
              },
            ]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: {
    flexShrink: 0,
  },
  action: {
    flexShrink: 0,
  },
});
