import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
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
  indicatorPosition: _indicatorPosition = 'right',
  variant = 'default',
  optionMinHeight,
}: Props<T>) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const popoverLayout = usePopoverLayout();
  const resolvedMaxHeight = popoverLayout?.maxHeight ?? maxHeight;
  const isNumeric = variant === 'numeric';
  const isWebMenu = Platform.OS === 'web';
  const resolvedOptionMinHeight =
    optionMinHeight ?? (isNumeric ? 36 : isWebMenu ? 36 : TOUCH_TARGET_MIN);

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
        paddingHorizontal: spacing.xxs,
      }}>
      {options.map((option) => {
        const selected = option.key === value;
        const disabled = Boolean(option.disabled);
        const webCursorStyle: ViewStyle | undefined =
          Platform.OS === 'web'
            ? ({ cursor: disabled ? 'not-allowed' : 'pointer' } as ViewStyle)
            : undefined;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
            // Do not set disabled on the row — it blocks nested lock Pressables.
            onPress={() => {
              if (disabled) return;
              onSelect(option.key);
              onAfterSelect?.();
            }}
            style={({ pressed, hovered }) => [
              styles.option,
              isNumeric ? styles.optionNumeric : null,
              webCursorStyle,
              {
                minHeight: resolvedOptionMinHeight,
                borderRadius: surfaceRadius.button,
                opacity: disabled ? 0.85 : 1,
                backgroundColor: selected
                  ? colors.surfaceMuted
                  : !disabled && (pressed || hovered)
                    ? colors.surfaceHover
                    : 'transparent',
                paddingHorizontal: isNumeric ? spacing.xs : spacing.sm,
              },
            ]}>
            {option.leading && !isNumeric ? (
              <View style={styles.adornmentSlot}>{option.leading}</View>
            ) : null}
            <Text
              style={[
                typography.caption,
                {
                  color: disabled ? colors.textMuted : colors.text,
                  textAlign: isNumeric ? 'center' : 'left',
                  flex: isNumeric ? undefined : 1,
                  width: isNumeric ? '100%' : undefined,
                  fontWeight: selected ? '500' : '400',
                },
                Platform.OS === 'web' && disabled
                  ? ({ cursor: 'not-allowed' } as object)
                  : null,
              ]}
              numberOfLines={1}>
              {option.label}
            </Text>
            {option.trailing && !isNumeric ? (
              <View
                style={[
                  styles.adornmentSlot,
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
                ]}>
                {option.trailing}
              </View>
            ) : null}
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
  adornmentSlot: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
