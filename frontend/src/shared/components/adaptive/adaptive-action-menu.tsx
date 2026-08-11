import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { AdaptivePopover } from '@/shared/components/adaptive/adaptive-popover';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type AdaptiveMenuItem = {
  key: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress: () => void;
};

export type MenuAnchor = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  visible: boolean;
  title?: string;
  items: AdaptiveMenuItem[];
  onClose: () => void;
  anchor?: MenuAnchor | null;
};

const POPOVER_WIDTH = 176;

export function AdaptiveActionMenu({ visible, title, items, onClose, anchor }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const isSheet = useCompactLayout();
  const resolvedTitle = title ?? t('common.actions');

  if (!visible) return null;

  if (isSheet) {
    return (
      <AdaptiveOverlay visible={visible} title={resolvedTitle} onClose={onClose} scrollable={false}>
        <View style={{ gap: 2 }}>
          {items.map((item) => (
            <MenuRow key={item.key} item={item} onClose={onClose} minHeight={TOUCH_TARGET_MIN} />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            onPress={onClose}
            style={({ pressed, hovered }) => [
              styles.cancel,
              {
                minHeight: TOUCH_TARGET_MIN,
                marginTop: spacing.xs,
                borderRadius: surfaceRadius.button,
                backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surfaceMuted,
              },
            ]}>
            <Text style={[typography.headingSemibold, { color: colors.text, textAlign: 'center' }]}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </AdaptiveOverlay>
    );
  }

  if (anchor) {
    return (
      <AdaptivePopover
        visible={visible}
        onClose={onClose}
        anchor={anchor}
        popoverWidth={POPOVER_WIDTH}
        title={resolvedTitle}
        contentStyle={{ paddingVertical: spacing.xxs }}>
        {items.map((item) => (
          <MenuRow key={item.key} item={item} onClose={onClose} minHeight={40} compact />
        ))}
      </AdaptivePopover>
    );
  }

  return (
    <AdaptiveOverlay visible={visible} title={resolvedTitle} onClose={onClose} scrollable={false} maxWidth={POPOVER_WIDTH + 48}>
      <View accessibilityRole="menu" style={{ gap: 2 }}>
        {items.map((item) => (
          <MenuRow key={item.key} item={item} onClose={onClose} minHeight={40} compact />
        ))}
      </View>
    </AdaptiveOverlay>
  );
}

function MenuRow({
  item,
  onClose,
  minHeight,
  compact,
}: {
  item: AdaptiveMenuItem;
  onClose: () => void;
  minHeight: number;
  compact?: boolean;
}) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const Icon = item.icon;
  const toneColor = item.tone === 'danger' ? colors.danger : colors.text;
  const textColor = item.disabled ? colors.textMuted : toneColor;

  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
      accessibilityState={{ disabled: item.disabled }}
      disabled={item.disabled}
      onPress={() => {
        if (item.disabled) return;
        onClose();
        item.onPress();
      }}
      style={({ pressed, hovered }) => [
        styles.item,
        compact ? styles.itemCompact : null,
        {
          minHeight,
          backgroundColor: !item.disabled
            ? (pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent')
            : 'transparent',
          paddingHorizontal: compact ? spacing.sm + 2 : spacing.sm,
          opacity: item.disabled ? 0.5 : 1,
          borderRadius: surfaceRadius.button,
        },
      ]}>
      {Icon ? <Icon size={compact ? 16 : 18} color={textColor} /> : null}
      <Text style={[compact ? typography.body : typography.body, { color: textColor, fontWeight: compact ? '500' : '400' }]}>
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemCompact: {
    gap: 8,
  },
  cancel: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
});
