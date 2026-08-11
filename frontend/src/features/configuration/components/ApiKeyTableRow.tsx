import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiKey } from '@/features/configuration/types/configuration.types';
import {
  canCopyFullKey,
  canRevealKey,
  formatApiKeyDate,
  formatApiKeyLastUsed,
  formatRequestCount,
  getDisplayKey,
} from '@/features/configuration/utils/configuration-display';
import { useTranslation } from '@/i18n';
import { ActionIcons } from '@/shared/constants/action-icons';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { copyText } from '@/shared/utils/copy-text';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  apiKey: ApiKey;
  revealed: boolean;
  revealedSecret?: string | null;
  revealing?: boolean;
  isLast?: boolean;
  onToggleReveal: () => void;
  onDelete: () => void;
  onCopyFeedback: (message: string, type?: 'success' | 'error') => void;
};

export function ApiKeyTableRow({
  apiKey,
  revealed,
  revealedSecret,
  revealing,
  isLast,
  onToggleReveal,
  onDelete,
  onCopyFeedback,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const numeric = typography.numeric;
  const [copied, setCopied] = useState(false);
  const displayKey = getDisplayKey(apiKey, revealed, revealedSecret);
  const revealable = canRevealKey(apiKey);
  const copyEnabled = canCopyFullKey(apiKey, revealed, revealedSecret);

  const handleCopy = async () => {
    if (!copyEnabled) return;
    const value = revealedSecret ?? apiKey.secretKey ?? '';
    const ok = await copyText(value);
    if (!ok) {
      onCopyFeedback(t('api-keys.toast.copyFailed'), 'error');
      return;
    }
    setCopied(true);
    onCopyFeedback(t('api-keys.toast.copiedShort'));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : 1,
          backgroundColor: colors.surface,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
        },
      ]}>
      <Text style={[typography.body, styles.cell, styles.nameCell, { color: colors.text }]} numberOfLines={1}>
        {apiKey.name}
      </Text>

      <View style={[styles.cell, styles.keyCell, styles.keyRow]}>
        <Text style={[typography.caption, styles.keyText, { color: colors.textMuted, fontFamily: fonts.mono }]} numberOfLines={1}>
          {displayKey}
        </Text>
        <View style={styles.keyActions}>
          {revealable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={revealed ? t('api-keys.a11y.hideKey') : t('api-keys.a11y.revealKey')}
              disabled={revealing}
              onPress={onToggleReveal}
              style={styles.iconBtn}>
              {revealing ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : revealed ? (
                <ActionIcons.hide size={15} color={colors.textMuted} />
              ) : (
                <ActionIcons.view size={15} color={colors.textMuted} />
              )}
            </Pressable>
          ) : null}
          {copyEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('api-keys.a11y.copyKey')}
              onPress={() => void handleCopy()}
              style={styles.iconBtn}>
              {copied ? <Check size={15} color={colors.primary} /> : <ActionIcons.copy size={15} color={colors.textMuted} />}
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={[typography.caption, numeric, styles.cell, { color: colors.textMuted }]}>{formatApiKeyDate(apiKey.createdAt)}</Text>
      <Text style={[typography.caption, numeric, styles.cell, { color: colors.textMuted }]}>
        {formatApiKeyLastUsed(apiKey.lastUsedAt)}
      </Text>
      <Text style={[typography.caption, numeric, styles.cell, { color: colors.text }]}>{formatRequestCount(apiKey.requestCount)}</Text>

      <View style={[styles.cell, styles.actionsCell]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('api-keys.a11y.deleteKey', { name: apiKey.name })}
          onPress={onDelete}
          style={({ pressed, hovered }) => [
            styles.deleteBtn,
            {
              width: TOUCH_TARGET_MIN,
              height: TOUCH_TARGET_MIN,
              borderRadius: surfaceRadius.button,
              backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent',
            },
          ]}>
          <ActionIcons.delete size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  nameCell: {
    flex: 1.1,
    minWidth: 88,
  },
  keyCell: {
    flex: 2.3,
    minWidth: 200,
    paddingRight: 8,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  keyText: {
    flex: 1,
    fontSize: 13,
  },
  keyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  actionsCell: {
    flex: 0.4,
    minWidth: 56,
    alignItems: 'flex-end',
  },
  iconBtn: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
