import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  /** `panel` = full section empty; `inline` = inside table/card body */
  variant?: 'panel' | 'inline';
  compact?: boolean;
  children?: React.ReactNode;
};

export function EmptyStateView({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  variant = 'panel',
  compact = false,
  children,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const isInline = variant === 'inline';
  const paddingVertical = compact ? spacing.md : isInline ? spacing.lg : spacing.lg;

  return (
    <View
      style={[
        styles.root,
        {
          paddingVertical,
          paddingHorizontal: spacing.sm,
          gap: spacing.sm,
        },
      ]}
      accessibilityRole="text">
      {Icon ? <Icon size={compact ? 24 : 28} color={colors.textMuted} /> : null}
      {title ? (
        <Text
          style={[
            typography.body,
            {
              color: colors.textMuted,
              fontWeight: '400',
              textAlign: 'center',
              maxWidth: 420,
            },
          ]}>
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text
          style={[
            typography.body,
            {
              color: colors.textMuted,
              fontWeight: '400',
              textAlign: 'center',
              lineHeight: 22,
              maxWidth: 420,
            },
          ]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.actionWrap}>
          <AppButton label={actionLabel} onPress={onAction} size="compact" />
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionWrap: {
    alignSelf: 'center',
    marginTop: 4,
  },
});
