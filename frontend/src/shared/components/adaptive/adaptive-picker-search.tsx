import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getFieldPlaceholderColor } from '@/shared/utils/field-placeholder-styles';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { webSuppressInputOutline } from '@/shared/utils/focus-ring-style';

export const PICKER_SEARCH_HEIGHT = 36;
/** Search row + inset + divider, subtracted from picker list max height. */
export const PICKER_SEARCH_BLOCK = 48;

type Props = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

function stopKeys(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

export function AdaptivePickerSearch({ value, placeholder, onChange }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const placeholderColor = getFieldPlaceholderColor(colors);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <View
      style={[
        styles.wrap,
        {
          borderBottomColor: colors.border,
          paddingHorizontal: spacing.xs,
          paddingVertical: spacing.xs,
        },
      ]}>
      <View
        style={[
          styles.field,
          {
            height: PICKER_SEARCH_HEIGHT,
            borderColor: focused ? colors.primary : colors.border,
            borderRadius: surfaceRadius.input,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.sm,
          },
        ]}>
        <ActionIcons.search size={16} color={focused ? colors.primary : colors.textMuted} />
        <TextInput
          ref={inputRef}
          {...searchInputAutofillProps}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          editable
          blurOnSubmit={false}
          autoFocus={Platform.OS === 'web'}
          accessibilityLabel={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyPress={stopKeys}
          {...(Platform.OS === 'web'
            ? {
                onKeyDown: stopKeys,
                onKeyUp: stopKeys,
              }
            : null)}
          style={[
            getToolbarSearchInputStyle(typography.caption, PICKER_SEARCH_HEIGHT - 2),
            { flex: 1, color: colors.text },
            webSuppressInputOutline(),
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
  },
});
