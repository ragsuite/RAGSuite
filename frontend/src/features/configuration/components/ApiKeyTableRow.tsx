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

      <View style={[styles.cell, styles.keyCell]}>
        <View
          style={[
            styles.keyChip,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.input,
              backgroundColor: colors.surfaceMuted,
              paddingLeft: spacing.sm,
              paddingRight: 2,
            },
          ]}>
          <Text
            style={[typography.caption, styles.keyText, { color: colors.textMuted, fontFamily: fonts.mono }]}
            numberOfLines={1}>
            {displayKey}
          </Text>
          <View style={styles.keyActions}>
            {revealable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={revealed ? t('api-keys.a11y.hideKey') : t('api-keys.a11y.revealKey')}
                disabled={revealing}
                onPress={onToggleReveal}
                hitSlop={4}
                style={({ pressed, hovered }) => [
                  styles.iconBtn,
                  {
                    borderRadius: surfaceRadius.button,
                    backgroundColor: pressed || hovered ? colors.surface : 'transparent',
                  },
                ]}>
                {revealing ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : revealed ? (
                  <ActionIcons.hide size={14} color={colors.textMuted} />
                ) : (
                  <ActionIcons.view size={14} color={colors.textMuted} />
                )}
              </Pressable>
            ) : null}
            {copyEnabled ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('api-keys.a11y.copyKey')}
                onPress={() => void handleCopy()}
                hitSlop={4}
                style={({ pressed, hovered }) => [
                  styles.iconBtn,
                  {
                    borderRadius: surfaceRadius.button,
                    backgroundColor: pressed || hovered ? colors.surface : 'transparent',
                  },
                ]}>
                {copied ? <Check size={14} color={colors.primary} /> : <ActionIcons.copy size={14} color={colors.textMuted} />}
              </Pressable>
            ) : null}
          </View>
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
  keyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minWidth: 0,
    minHeight: 32,
    gap: 2,
  },
  keyText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
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
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
