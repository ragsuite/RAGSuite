import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { Check } from 'lucide-react-native';

import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

const NATIVE_MAX_CODE_HEIGHT = 320;

type Props = {
  code: string;
  accessibilityLabel: string;
  copied?: boolean;
  onCopy: () => void;
  /** @deprecated Inline icon copy is always used; kept for call-site compatibility. */
  copyButtonLabel?: string;
};

export function IntegrationCodeBlock({
  code,
  accessibilityLabel,
  copied = false,
  onCopy,
  copyButtonLabel,
}: Props) {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const { t } = useTranslation();
  const isNative = Platform.OS !== 'web';
  const resolvedCopyLabel = copyButtonLabel ?? t('common.copySnippet');

  const codeText = (
    <Text
      selectable
      style={[
        typography.citation,
        styles.code,
        { color: colors.primaryTint, fontFamily: fonts.mono },
      ]}>
      {code}
    </Text>
  );

  const horizontalScroll = (
    <AppScrollView
      horizontal
      showsHorizontalScrollIndicator={Platform.OS === 'web'}
      nestedScrollEnabled
      accessibilityHint={t('common.swipeToReadSnippet')}
      style={styles.codeScroll}
      contentContainerStyle={{ padding: spacing.md, paddingRight: spacing.xl + TOUCH_TARGET_MIN }}>
      {codeText}
    </AppScrollView>
  );

  return (
    <View
      style={[
        styles.block,
        {
          borderColor: colors.pineDeep,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.pineDeep,
        },
      ]}
      accessibilityLabel={accessibilityLabel}>
      {isNative ? (
        <AppScrollView
          nestedScrollEnabled
          style={{ maxHeight: NATIVE_MAX_CODE_HEIGHT }}
          contentContainerStyle={{ flexGrow: 1 }}>
          {horizontalScroll}
        </AppScrollView>
      ) : (
        horizontalScroll
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? t('common.snippetCopied') : resolvedCopyLabel}
        onPress={onCopy}
        style={({ pressed, hovered }) => [
          styles.copyOverlay,
          {
            minWidth: TOUCH_TARGET_MIN,
            minHeight: TOUCH_TARGET_MIN,
            borderRadius: surfaceRadius.button,
            borderColor: colors.primaryTint,
            borderWidth: 1,
            backgroundColor:
              pressed || hovered ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.1)',
          },
        ]}>
        {copied ? (
          <Check size={16} color={colors.primaryTint} />
        ) : (
          <ActionIcons.copy size={16} color={colors.primaryTint} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderWidth: 1, overflow: 'hidden', position: 'relative' },
  codeScroll: { maxWidth: '100%' },
  code: { lineHeight: 20 },
  copyOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
