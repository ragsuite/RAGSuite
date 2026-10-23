import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { useFieldWriteLock } from '@/features/organization/hooks/use-module-write';
import { AppColorPickerTrigger } from '@/shared/components/app-color-picker-trigger';
import { AppColorPreviewSwatch } from '@/shared/components/app-color-preview-swatch';
import { AppNativeColorPickerSheet } from '@/shared/components/app-native-color-picker-sheet';
import { normalizeHex } from '@/shared/utils/color-picker';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';
import { webFocusBorderStyle, webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
import { webLockedCursor } from '@/shared/utils/web-locked-cursor';

type SwatchSize = number | { width: number; height: number };

type ColorFieldController = {
  value: string;
  onChange: (value: string) => void;
  applyPickerValue: (hex: string) => void;
  openPicker: () => void;
  label: string;
};

const AppColorFieldContext = createContext<ColorFieldController | null>(null);

function useAppColorFieldContext() {
  const context = useContext(AppColorFieldContext);
  if (!context) {
    throw new Error('AppColorField compound components must be used within AppColorFieldRoot.');
  }
  return context;
}

type RootProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPickerChange?: (value: string) => void;
  children: React.ReactNode;
};

export function AppColorFieldRoot({ label, value, onChange, onPickerChange, children }: RootProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const locked = useFieldWriteLock();
  const normalized = normalizeHex(value);

  const applyPickerValue = useCallback(
    (hex: string) => {
      if (locked) return;
      if (onPickerChange) {
        onPickerChange(hex);
        return;
      }
      onChange(hex);
    },
    [locked, onChange, onPickerChange],
  );

  const handleChange = useCallback(
    (next: string) => {
      if (locked) return;
      onChange(next);
    },
    [locked, onChange],
  );

  const controller = useMemo<ColorFieldController>(
    () => ({
      value,
      onChange: handleChange,
      applyPickerValue,
      openPicker: () => {
        if (!locked) setPickerOpen(true);
      },
      label,
    }),
    [applyPickerValue, handleChange, label, locked, value],
  );

  return (
    <AppColorFieldContext.Provider value={controller}>
      {children}
      {Platform.OS !== 'web' ? (
        <AppNativeColorPickerSheet
          visible={pickerOpen && !locked}
          title={label}
          value={normalized}
          onClose={() => setPickerOpen(false)}
          onApply={(hex) => {
            applyPickerValue(hex);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </AppColorFieldContext.Provider>
  );
}

type InputProps = {
  showLabel?: boolean;
  leading?: React.ReactNode;
};

export function AppColorFieldInput({ showLabel = true, leading }: InputProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { value, onChange, label } = useAppColorFieldContext();
  const locked = useFieldWriteLock();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={{ gap: spacing.xxs }}>
      {showLabel && label ? (
        <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.row,
          {
            borderRadius: surfaceRadius.button,
            backgroundColor: colors.surfaceMuted,
            borderColor: isFocused && !locked ? colors.primary : colors.border,
            borderWidth: 1,
            opacity: locked ? 0.72 : 1,
          },
          webFocusBorderStyle(isFocused && !locked, colors.primary, colors.border),
          webLockedCursor(locked),
        ]}
        pointerEvents="box-none">
        {leading}
        <AppColorPreviewSwatch value={value} />
        <TextInput
          accessibilityLabel={label}
          accessibilityState={{ disabled: locked }}
          value={value}
          editable={!locked}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={locked ? undefined : onChange}
          onFocus={() => {
            if (!locked) setIsFocused(true);
          }}
          onBlur={() => setIsFocused(false)}
          placeholder="#ffffff"
          placeholderTextColor={colors.textMuted}
          style={[
            getInputTextStyle(typography.fieldInput, { fillContainer: true }),
            styles.input,
            { color: colors.text },
            webSuppressInputOutline(),
          ]}
        />
      </View>
    </View>
  );
}

type PickerTriggerProps = {
  size?: SwatchSize;
  accessibilityLabel?: string;
};

export function AppColorFieldPickerTrigger({ size, accessibilityLabel }: PickerTriggerProps) {
  const { value, applyPickerValue, openPicker } = useAppColorFieldContext();

  return (
    <AppColorPickerTrigger
      value={value}
      onChange={applyPickerValue}
      onPress={openPicker}
      size={size}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

type AppColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPickerChange?: (value: string) => void;
  /** When `inline`, gradient trigger sits in the input row. Default `none` — place AppColorFieldPickerTrigger on a preset row. */
  pickerTriggerPlacement?: 'inline' | 'none';
};

export function AppColorField({
  label,
  value,
  onChange,
  onPickerChange,
  pickerTriggerPlacement = 'none',
}: AppColorFieldProps) {
  return (
    <AppColorFieldRoot label={label} value={value} onChange={onChange} onPickerChange={onPickerChange}>
      <AppColorFieldInput
        leading={
          pickerTriggerPlacement === 'inline' ? <AppColorFieldPickerTrigger /> : undefined
        }
      />
    </AppColorFieldRoot>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 44,
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
});
