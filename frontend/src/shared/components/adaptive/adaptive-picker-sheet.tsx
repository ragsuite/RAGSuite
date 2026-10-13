import { Check } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type PickerOption<T extends string> = {
  key: T;
  label: string;
  leading?: React.ReactNode;
  /** Right-side affordance (e.g. Enterprise lock after the label). */
  trailing?: React.ReactNode;
  /** When true, option cannot be selected (e.g. Enterprise-locked Member). */
  disabled?: boolean;
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
        const disabled = Boolean(option.disabled);
        const check = selected && !option.trailing ? <Check size={18} color={colors.primary} /> : null;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
            // Do not set disabled on the row — it blocks nested lock Pressables.
            onPress={() => {
              if (disabled) return;
              onSelect(option.key);
              onClose();
            }}
            style={({ pressed, hovered }) => [
              styles.option,
              Platform.OS === 'web'
                ? ({ cursor: disabled ? 'not-allowed' : 'pointer' } as object)
                : null,
              {
                minHeight: TOUCH_TARGET_MIN,
                borderRadius: surfaceRadius.button,
                opacity: disabled ? 0.85 : 1,
                backgroundColor:
                  selected || (!disabled && pressed)
                    ? colors.surfaceMuted
                    : !disabled && hovered
                      ? colors.surfaceHover
                      : 'transparent',
                paddingHorizontal: spacing.sm,
              },
            ]}>
            {indicatorPosition === 'left' ? <View style={styles.checkSlot}>{check}</View> : null}
            {option.leading ? <View style={styles.adornmentSlot}>{option.leading}</View> : null}
            <Text
              style={[
                typography.body,
                { color: disabled ? colors.textMuted : colors.text, flex: 1 },
                selected ? styles.optionSelected : null,
                Platform.OS === 'web' && disabled
                  ? ({ cursor: 'not-allowed' } as object)
                  : null,
              ]}>
              {option.label}
            </Text>
            {option.trailing ? (
              <View
                style={[
                  styles.adornmentSlot,
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
                ]}>
                {option.trailing}
              </View>
            ) : null}
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
  adornmentSlot: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
