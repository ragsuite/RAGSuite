import { Check, Info, KeyRound } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { ConfigurationSheet } from '@/features/configuration/components/ConfigurationSheet';
import type { ApiKey } from '@/features/configuration/types/configuration.types';
import { formatApiKeyEnvironment } from '@/features/configuration/utils/configuration-display';
import { useTranslation } from '@/i18n';
import { copyText } from '@/shared/utils/copy-text';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  visible: boolean;
  apiKey: ApiKey | null;
  fullKey: string | null;
  onClose: () => void;
  onCopyFeedback: (message: string, type?: 'success' | 'error') => void;
};

export function ApiKeyCreatedSheet({ visible, apiKey, fullKey, onClose, onCopyFeedback }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!fullKey) return;
    const ok = await copyText(fullKey);
    if (!ok) {
      onCopyFeedback(t('api-keys.toast.copyFailed'), 'error');
      return;
    }
    setCopied(true);
    onCopyFeedback(t('api-keys.toast.copiedShort'));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ConfigurationSheet
      visible={visible}
      title={t('api-keys.dialog.title')}
      subtitle={t('api-keys.dialog.description')}
      titleIcon={KeyRound}
      size="form"
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <ConfigurationOutlineButton label={t('common.done')} onPress={onClose} />
        </View>
      }>
      <View
        style={[
          styles.infoBox,
          {
            borderColor: colors.primary + '33',
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surfaceMuted,
            padding: spacing.sm,
            gap: spacing.sm,
          },
        ]}>
        <Info size={18} color={colors.primary} />
        <Text style={[typography.caption, { color: colors.text, flex: 1, lineHeight: 20 }]}>
          {t('api-keys.dialog.alert')}
        </Text>
      </View>

      <View
        style={[
          styles.keyBlock,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surface,
            padding: spacing.sm,
          },
        ]}>
        <View style={styles.keyRow}>
          <View style={styles.keyTextWrap}>
            <Text
              selectable
              style={[
                typography.caption,
                styles.keyText,
                { color: colors.text, fontFamily: fonts.mono },
                Platform.OS === 'web' ? styles.keyTextWeb : null,
              ]}>
              {fullKey ?? '—'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('api-keys.a11y.copyKey')}
            onPress={() => void handleCopy()}
            hitSlop={8}
            style={({ pressed }) => [
              styles.copyBtn,
              {
                width: 28,
                height: 28,
                borderRadius: surfaceRadius.button,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
              },
            ]}>
            {copied ? <Check size={14} color={colors.primary} /> : <ActionIcons.copy size={14} color={colors.textMuted} />}
          </Pressable>
        </View>
      </View>

      {apiKey ? (
        <View style={[styles.metaGrid, { gap: spacing.md }]}>
          <View style={styles.metaItem}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{t('api-keys.name')}</Text>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{apiKey.name}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{t('api-keys.environment')}</Text>
            <Text style={[typography.body, { color: colors.text }]}>{formatApiKeyEnvironment(apiKey.environment)}</Text>
          </View>
        </View>
      ) : null}
    </ConfigurationSheet>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
  },
  keyBlock: {
    borderWidth: 1,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  keyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  keyText: {
    lineHeight: 20,
  },
  keyTextWeb: {
    // Unbroken API key tokens otherwise overflow the flex sibling (copy button).
    wordBreak: 'break-all',
    overflowWrap: 'anywhere',
  } as const,
  copyBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaItem: {
    minWidth: '40%',
    gap: 4,
  },
});
