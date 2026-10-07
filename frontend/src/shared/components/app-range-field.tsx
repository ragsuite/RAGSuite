import Slider from '@react-native-community/slider';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  editable?: boolean;
  /** Optional control beside the label (e.g. InfoHintButton). */
  labelAccessory?: React.ReactNode;
  onChange: (value: number) => void;
};

function snap(value: number, min: number, max: number, step: number) {
  const steps = Math.round((value - min) / step);
  return Math.min(max, Math.max(min, min + steps * step));
}

export function AppRangeField({
  label,
  value,
  min,
  max,
  step = 1,
  formatValue,
  editable = false,
  labelAccessory,
  onChange,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const display = formatValue ? formatValue(value) : String(value);
  const [draftText, setDraftText] = useState(display);

  useEffect(() => {
    setDraftText(display);
  }, [display]);

  const handleChange = (next: number) => {
    onChange(snap(next, min, max, step));
  };

  const commitDraft = () => {
    const parsed = Number.parseFloat(draftText.replace(/[^\d.-]/g, ''));
    if (Number.isNaN(parsed)) {
      setDraftText(display);
      return;
    }
    handleChange(parsed);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.labelRow}>
        <View style={styles.labelCluster}>
          <Text style={[typography.fieldLabel, { color: colors.text, flexShrink: 1 }]}>{label}</Text>
          {labelAccessory}
        </View>
        {editable ? (
          <TextInput
            accessibilityLabel={`${label} value`}
            value={draftText}
            keyboardType="decimal-pad"
            onChangeText={setDraftText}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            style={[
              getInputTextStyle(typography.fieldInput, { height: 36, includeHorizontalPadding: false }),
              styles.valueInput,
              {
                color: colors.primary,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: surfaceRadius.input,
              },
            ]}
          />
        ) : display ? (
          <Text
            style={[typography.body, { color: colors.primary }]}
            accessibilityLabel={`${label} value`}>
            {display}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.sliderWrap,
          {
            borderRadius: spacing.xs,
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
          },
        ]}>
        <Slider
          accessibilityLabel={label}
          accessibilityRole="adjustable"
          accessibilityValue={{ min, max, now: value, text: display }}
          value={value}
          minimumValue={min}
          maximumValue={max}
          step={step}
          onValueChange={handleChange}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
          style={styles.slider}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  labelCluster: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 0 },
  valueInput: {
    minWidth: 52,
    maxWidth: 72,
    textAlign: 'right',
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  sliderWrap: {
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: Platform.OS === 'ios' ? 4 : 0,
  },
  slider: {
    width: '100%',
    height: Platform.OS === 'ios' ? 32 : 40,
  },
});
