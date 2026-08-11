import { Check } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type PickerOption<T extends string> = {
  key: T;
  label: string;
  leading?: React.ReactNode;
};

type Props<T extends string> = {
  visible: boolean;
  title: string;
  subtitle?: string;
  value: T;
  options: PickerOption<T>[];
  onSelect: (value: T) => void;
  onClose: () => void;
  indicatorPosition?: 'left' | 'right';
};

/** Compact model/select picker — uses overlay scroll (no scrollbar gutter on mobile). */
export function AdaptivePickerSheet<T extends string>({
  visible,
  title,
  subtitle,
  value,
  options,
  onSelect,
  onClose,
  indicatorPosition = 'right',
}: Props<T>) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <AdaptiveOverlay
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      scrollable
      scrollStyle={{ maxHeight: 360 }}
      contentStyle={{ gap: 2, paddingBottom: spacing.xs }}
      accessibilityLabel={title}>
      {options.map((option) => {
        const selected = option.key === value;
        const check = selected ? <Check size={18} color={colors.primary} /> : null;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              onSelect(option.key);
              onClose();
            }}
            style={({ pressed, hovered }) => [
              styles.option,
              {
                minHeight: TOUCH_TARGET_MIN,
                borderRadius: surfaceRadius.button,
                backgroundColor: selected || pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent',
                paddingHorizontal: spacing.sm,
              },
            ]}>
            {indicatorPosition === 'left' ? <View style={styles.checkSlot}>{check}</View> : null}
            {option.leading ? <View style={styles.leadingSlot}>{option.leading}</View> : null}
            <Text
              style={[
                typography.body,
                { color: colors.text, flex: 1 },
                selected ? styles.optionSelected : null,
              ]}>
              {option.label}
            </Text>
            {indicatorPosition === 'right' && check ? check : null}
          </Pressable>
        );
      })}
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionSelected: {
  },
  checkSlot: {
    width: 18,
    alignItems: 'center',
  },
  leadingSlot: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
