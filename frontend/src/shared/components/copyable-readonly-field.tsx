import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTextField } from '@/shared/components/app-text-field';
import { InfoHintButton } from '@/shared/components/info-hint-button';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { copyText } from '@/shared/utils/copy-text';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';

type Props = {
  label: string;
  value: string;
  copyA11yLabel: string;
  copiedA11yLabel?: string;
  helper?: string;
  hintTitle?: string;
  hintBody?: string;
};

export function CopyableReadOnlyField({
  label,
  value,
  copyA11yLabel,
  copiedA11yLabel,
  helper,
  hintTitle,
  hintBody,
}: Props) {
  const { colors, mode, typography, spacing } = useAppTheme();
  const iconColor = mode === 'dark' ? colors.text : colors.textSoft;
  const [copied, setCopied] = useState(false);
  const CopyIcon = copied ? ActionIcons.success : ActionIcons.copy;

  return (
    <View style={{ gap: spacing.xs }}>
      <AppTextField
        label={label}
        value={value}
        editable={false}
        autoCapitalize="none"
        autoCorrect={false}
        labelAccessory={
          hintTitle && hintBody ? (
            <InfoHintButton title={hintTitle} body={hintBody} accessibilityLabel={hintTitle} />
          ) : null
        }
        rightAdornment={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? copiedA11yLabel ?? copyA11yLabel : copyA11yLabel}
            onPress={() => {
              void (async () => {
                const ok = await copyText(value);
                if (!ok) return;
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              })();
            }}
            hitSlop={8}
            style={({ focused, pressed }) => [
              styles.actionBtn,
              focusRingStyle(focused, colors.primary),
              pressed ? { backgroundColor: colors.surfaceMuted } : null,
            ]}>
            <CopyIcon size={16} color={copied ? colors.success : iconColor} />
          </Pressable>
        }
      />
      {helper ? <Text style={[typography.caption, { color: colors.textMuted }]}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
});
