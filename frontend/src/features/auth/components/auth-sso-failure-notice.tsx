import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GoogleBrandIcon } from '@/shared/components/google-brand-icon';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { platformShadow } from '@/shared/utils/platform-shadow';

type Props = {
  message: string;
};

/**
 * Enterprise SSO failure callout: official Google mark + one clear message.
 * No second alert icon; keeps the page header as the only title.
 */
export function AuthSsoFailureNotice({ message }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View style={[styles.stack, { gap: spacing.md }]}>
      <View
        style={[
          styles.mark,
          platformShadow(
            {
              shadowColor: colors.text,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
              elevation: 1,
            },
            { boxShadow: `0 2px 8px ${colors.text}14` },
          ),
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: surfaceRadius.button,
          },
        ]}>
        <GoogleBrandIcon size={24} />
      </View>

      <View
        accessibilityRole="alert"
        style={[
          styles.messagePanel,
          {
            gap: spacing.xs,
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.md,
          },
        ]}>
        <View style={[styles.accent, { backgroundColor: colors.danger }]} />
        <Text
          style={[
            typography.body,
            styles.message,
            { color: colors.text, lineHeight: 22, flex: 1 },
          ]}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: '100%',
    alignItems: 'center',
  },
  mark: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  messagePanel: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 2,
  },
  message: {
    fontWeight: '500',
  },
});
