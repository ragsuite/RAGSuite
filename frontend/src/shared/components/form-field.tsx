import React from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export function FormField({ label, error, style, ...inputProps }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View style={[styles.wrapper, { gap: spacing.xxs + 2 }]}>
      <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        {...inputProps}
        style={[
          styles.input,
          getInputTextStyle(typography.fieldInput),
          {
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
            borderRadius: surfaceRadius.input,
            paddingHorizontal: spacing.sm,
          },
          style,
        ]}
        placeholderTextColor={colors.textMuted}
      />
      {error ? <Text style={[typography.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  input: {
    borderWidth: 1,
  },
});
