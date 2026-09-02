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
  variant?: 'default' | 'numeric';
  optionMinHeight?: number;
};

export function AdaptivePickerOptionList<T extends string>({
  value,
  options,
  onSelect,
  onAfterSelect,
  maxHeight = 220,
  indicatorPosition = 'right',
  variant = 'default',
  optionMinHeight,
}: Props<T>) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const popoverLayout = usePopoverLayout();
  const resolvedMaxHeight = popoverLayout?.maxHeight ?? maxHeight;
  const isNumeric = variant === 'numeric';
  const resolvedOptionMinHeight = optionMinHeight ?? (isNumeric ? 36 : TOUCH_TARGET_MIN);

  return (
    <AppScrollView
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
      nestedScrollEnabled
      showsVerticalScrollIndicator={!isNumeric}
      scrollbarVariant="overlay"
      style={{ maxHeight: resolvedMaxHeight }}
      contentContainerStyle={{
        gap: isNumeric ? spacing.xxs : 2,
        paddingVertical: spacing.xxs,
        paddingHorizontal: isNumeric ? spacing.xxs : 0,
      }}>
      {options.map((option) => {
        const selected = option.key === value;
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
              isNumeric ? styles.optionNumeric : null,
              {
                minHeight: resolvedOptionMinHeight,
                borderRadius: surfaceRadius.button,
                backgroundColor: selected || pressed
                  ? colors.surfaceMuted
                  : hovered
                    ? colors.surfaceHover
                    : 'transparent',
                paddingHorizontal: isNumeric ? spacing.xs : spacing.sm,
              },
            ]}>
            <Text
              style={[
                isNumeric ? typography.caption : typography.body,
                {
                  color: colors.text,
                  textAlign: isNumeric ? 'center' : 'left',
                  flex: isNumeric ? undefined : 1,
                  width: isNumeric ? '100%' : undefined,
                  fontWeight: selected ? '600' : '400',
                },
              ]}>
              {option.label}
            </Text>
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
  optionNumeric: {
    justifyContent: 'center',
  },
});
