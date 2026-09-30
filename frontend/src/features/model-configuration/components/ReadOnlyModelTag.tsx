import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  /** Model display name; when empty the tag shows `emptyLabel` in a muted tone. */
  value: string;
  emptyLabel: string;
};

/** Labelled, non-editable model tag (models are managed in Model Configuration). */
export function ReadOnlyModelTag({ label, value, emptyLabel }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const hasValue = value.trim().length > 0;
  const shown = hasValue ? value : emptyLabel;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${shown}`}
      style={[styles.root, { gap: spacing.xs }]}>
      <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>
      <StatusBadge label={shown} tone={hasValue ? 'default' : 'muted'} preserveCase />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minWidth: 160 },
});
