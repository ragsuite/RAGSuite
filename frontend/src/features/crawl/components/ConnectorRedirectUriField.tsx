import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppTextField } from '@/shared/components/app-text-field';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';
import { ActionIcons } from '@/shared/constants/action-icons';

import { typography } from '@/theme/typography';

const credentialInputStyle = {
  fontSize: typography.fieldInput.fontSize,
  lineHeight: typography.fieldInput.lineHeight,
};

type Props = {
  label: string;
  value: string;
  onCopy: () => void;
  copyA11yLabel: string;
};

export function ConnectorRedirectUriField({ label, value, onCopy, copyA11yLabel }: Props) {
  const { colors, mode } = useAppTheme();
  const defaultIconColor = mode === 'dark' ? colors.text : colors.textSoft;

  return (
    <AppTextField
      label={label}
      value={value}
      editable={false}
      autoCapitalize="none"
      autoCorrect={false}
      style={credentialInputStyle}
      rightAdornment={
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copyA11yLabel}
            onPress={onCopy}
            hitSlop={8}
            style={({ focused, pressed }) => [
              styles.actionBtn,
              focusRingStyle(focused, colors.primary),
              pressed ? { backgroundColor: colors.surfaceMuted } : null,
            ]}>
            {({ pressed }) => (
              <ActionIcons.copy size={16} color={pressed ? colors.primary : defaultIconColor} />
            )}
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: TOOLBAR_CONTROL_HEIGHT,
    height: TOOLBAR_CONTROL_HEIGHT,
    borderRadius: 4,
  },
});

export const connectorCredentialInputStyle = credentialInputStyle;
