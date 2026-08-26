import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { Check } from 'lucide-react-native';

import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';
import { brandTokens } from '@/theme/brand-tokens';

const NATIVE_MAX_CODE_HEIGHT = 320;

/** Locked snippet chrome — never follows light/dark or custom primary. */
const CODE_BLOCK_BG = brandTokens.color.pineDeep;
const CODE_BLOCK_FG = brandTokens.color.pineTint;

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
  const { spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const { t } = useTranslation();
  const isNative = Platform.OS !== 'web';
  const resolvedCopyLabel = copyButtonLabel ?? t('common.copySnippet');

  const codeText = (
    <Text
      selectable
      style={[
        typography.citation,
        styles.code,
        { color: CODE_BLOCK_FG, fontFamily: fonts.mono },
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
          borderColor: CODE_BLOCK_BG,
          borderRadius: surfaceRadius.card,
          backgroundColor: CODE_BLOCK_BG,
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
            borderColor: CODE_BLOCK_FG,
            borderWidth: 1,
            backgroundColor:
              pressed || hovered ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.1)',
          },
        ]}>
        {copied ? (
          <Check size={16} color={CODE_BLOCK_FG} />
        ) : (
          <ActionIcons.copy size={16} color={CODE_BLOCK_FG} />
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
