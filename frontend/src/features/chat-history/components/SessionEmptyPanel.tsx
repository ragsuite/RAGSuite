import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  title: string;
  body?: string;
  icon: LucideIcon;
  /** Compact for column / mobile empties. */
  compact?: boolean;
  /** Soft bordered card (full-page empty). */
  card?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Polished empty state for History / Feedback session views.
 * Full-page: card + large badge. Compact: smaller badge for column empties.
 */
export function SessionEmptyPanel({
  title,
  body,
  icon: Icon,
  compact = false,
  card = false,
  style,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const badgeSize = compact ? 40 : 56;
  const iconSize = compact ? 20 : 26;

  const content = (
    <View
      style={[
        styles.inner,
        {
          paddingVertical: compact ? spacing.lg : spacing.xl,
          paddingHorizontal: spacing.md,
          gap: compact ? spacing.sm : spacing.md,
          minHeight: compact ? undefined : 280,
        },
      ]}
      accessibilityRole="text">
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: colors.surfaceMuted,
          },
        ]}>
        <Icon size={iconSize} color={colors.textMuted} />
      </View>
      <Text
        style={[
          compact ? typography.body : typography.subtitle,
          {
            color: colors.text,
            fontWeight: '600',
            textAlign: 'center',
            maxWidth: 420,
          },
        ]}>
        {title}
      </Text>
      {body ? (
        <Text
          style={[
            typography.body,
            {
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: compact ? 20 : 22,
              maxWidth: 440,
              fontSize: compact ? 14 : undefined,
            },
          ]}>
          {body}
        </Text>
      ) : null}
    </View>
  );

  if (!card) {
    return <View style={[styles.root, style]}>{content}</View>;
  }

  return (
    <View
      style={[
        styles.root,
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 8,
        },
        style,
      ]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 0,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  inner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
