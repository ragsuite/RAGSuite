import { Check } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import type { PickerOption } from '@/shared/components/adaptive/adaptive-picker-sheet';
import { usePopoverLayout } from '@/shared/components/adaptive/adaptive-popover';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props<T extends string> = {
  value: T;
  options: PickerOption<T>[];
  onSelect: (value: T) => void;
  onAfterSelect?: () => void;
  maxHeight?: number;
  indicatorPosition?: 'left' | 'right';
};

export function AdaptivePickerOptionList<T extends string>({
  value,
  options,
  onSelect,
  onAfterSelect,
  maxHeight = 220,
  indicatorPosition = 'right',
}: Props<T>) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const popoverLayout = usePopoverLayout();
  const resolvedMaxHeight = popoverLayout?.maxHeight ?? maxHeight;

  return (
    <AppScrollView
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
      nestedScrollEnabled
      showsVerticalScrollIndicator
      scrollbarVariant="overlay"
      style={{ maxHeight: resolvedMaxHeight }}
      contentContainerStyle={{ gap: 2, paddingVertical: spacing.xxs }}>
      {options.map((option) => {
        const selected = option.key === value;
        const check = selected ? <Check size={18} color={colors.primary} /> : null;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              onSelect(option.key);
              onAfterSelect?.();
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
    </AppScrollView>
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
});
