import { Check } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  checked: boolean;
  /** Outer box size in px. Default 18. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Visual checkbox mark (box + filled tick when checked).
 * Pair with a parent Pressable that owns accessibilityRole="checkbox".
 */
export function AppCheckboxMark({ checked, size = 18, style }: Props) {
  const { colors } = useAppTheme();
  const iconSize = Math.max(10, Math.round(size * 0.7));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : colors.surface,
        },
        style,
      ]}>
      {checked ? <Check size={iconSize} color={colors.textOnPrimary} strokeWidth={3} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
