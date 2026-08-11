import React, { useId, useState } from 'react';
import { Platform, Pressable } from 'react-native';

import { AppTextField } from '@/shared/components/app-text-field';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  /** When true, blocks browser autofill until the user focuses the field. */
  preventAutofill?: boolean;
  autoComplete?: "current-password" | "new-password" | "password" | "off";
};

export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  preventAutofill = false,
  autoComplete = "off",
}: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [autofillUnlocked, setAutofillUnlocked] = useState(!preventAutofill);
  const fieldId = useId();
  const { colors } = useAppTheme();

  return (
    <AppTextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!isVisible}
      placeholder={placeholder}
      error={error}
      editable={autofillUnlocked}
      readOnly={preventAutofill && Platform.OS === "web" && !autofillUnlocked}
      autoComplete={autoComplete}
      textContentType={preventAutofill ? "none" : undefined}
      nativeID={preventAutofill ? `pwd-${fieldId}` : undefined}
      onFocus={() => setAutofillUnlocked(true)}
      rightAdornment={
        <Pressable
          onPress={() => setIsVisible((prev) => !prev)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? 'Hide password' : 'Show password'}
          style={({ focused }) => focusRingStyle(focused, colors.primary)}>
          {isVisible ? (
            <ActionIcons.hide size={18} color={colors.textMuted} />
          ) : (
            <ActionIcons.view size={18} color={colors.textMuted} />
          )}
        </Pressable>
      }
    />
  );
}
