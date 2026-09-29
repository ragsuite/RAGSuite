import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle, INPUT_FIELD_HEIGHT } from '@/shared/utils/input-text-style';

type Props = {
  label: string;
  description: string;
  placeholder: string;
  draft: string;
  patterns: string[];
  onChangeDraft: (value: string) => void;
  onAdd: () => void;
  onRemove: (pattern: string) => void;
};

/** URL pattern input with an add button and removable chips. */
export function SourcePatternField({
  label,
  description,
  placeholder,
  draft,
  patterns,
  onChangeDraft,
  onAdd,
  onRemove,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{description}</Text>
      <View
        style={[
          styles.combo,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.input,
            backgroundColor: colors.surfaceMuted,
          },
        ]}>
        <TextInput
          accessibilityLabel={label}
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          onSubmitEditing={onAdd}
          returnKeyType="done"
          style={[
            getInputTextStyle(typography.fieldInput, { fillContainer: true }),
            styles.input,
            { color: colors.text },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${label.toLowerCase()}`}
          onPress={onAdd}
          style={({ pressed }) => [
            styles.addBtn,
            {
              width: INPUT_FIELD_HEIGHT,
              borderLeftColor: colors.border,
              backgroundColor: pressed ? colors.primaryPressed : colors.primary,
            },
          ]}>
          <ActionIcons.add size={18} color={colors.textOnPrimary} />
        </Pressable>
      </View>
      {patterns.length > 0 ? (
        <View style={[styles.chips, { gap: spacing.xs }]}>
          {patterns.map((pattern) => (
            <Pressable
              key={pattern}
              accessibilityRole="button"
              accessibilityLabel={`Remove pattern ${pattern}`}
              onPress={() => onRemove(pattern)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: colors.border,
                  borderRadius: surfaceRadius.button,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                },
              ]}>
              <Text style={[typography.caption, { color: colors.text }]} numberOfLines={1}>
                {pattern}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  combo: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    overflow: 'hidden',
    height: INPUT_FIELD_HEIGHT,
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  addBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
});
