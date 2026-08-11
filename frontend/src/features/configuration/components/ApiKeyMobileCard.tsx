import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiKey } from '@/features/configuration/types/configuration.types';
import {
  canCopyFullKey,
  canRevealKey,
  formatApiKeyDate,
  formatApiKeyEnvironment,
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
  onToggleReveal: () => void;
  onDelete: () => void;
  onCopyFeedback: (message: string, type?: 'success' | 'error') => void;
};

export function ApiKeyMobileCard({
  apiKey,
  revealed,
  revealedSecret,
  revealing,
  onToggleReveal,
  onDelete,
  onCopyFeedback,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, elevation, surfaceRadius, fonts } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const inputRadius = surfaceRadius.input;
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
        styles.card,
        elevation.card,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surface,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
            {apiKey.name}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {formatApiKeyEnvironment(apiKey.environment)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('api-keys.a11y.deleteKey', { name: apiKey.name })}
          onPress={onDelete}
          style={({ pressed, hovered }) => [
            styles.deleteBtn,
            {
              width: TOUCH_TARGET_MIN,
              height: TOUCH_TARGET_MIN,
              borderRadius: controlRadius,
              backgroundColor: pressed ? colors.dangerBackground : colors.surfaceMuted,
            },
          ]}>
          <ActionIcons.delete size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View
        style={[
          styles.keyRow,
          {
            borderColor: colors.border,
            borderRadius: inputRadius,
            backgroundColor: colors.surface,
            paddingLeft: spacing.sm,
            paddingRight: spacing.xxs,
            minHeight: 40,
          },
        ]}>
        <Text style={[typography.caption, styles.keyText, { color: colors.text, flex: 1, fontFamily: fonts.mono }]} numberOfLines={2}>
          {displayKey}
        </Text>
        <View style={[styles.keyActions, { gap: spacing.xs }]}>
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
                <ActionIcons.hide size={18} color={colors.textMuted} />
              ) : (
                <ActionIcons.view size={18} color={colors.textMuted} />
              )}
            </Pressable>
          ) : null}
          {copyEnabled ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('api-keys.a11y.copyKey')} onPress={() => void handleCopy()} style={styles.iconBtn}>
              {copied ? <Check size={18} color={colors.primary} /> : <ActionIcons.copy size={18} color={colors.textMuted} />}
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={[styles.metaGrid, { gap: spacing.xs }]}>
        <View style={styles.metaItem}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('api-keys.created')}</Text>
          <Text style={[typography.caption, typography.numeric, { color: colors.text }]}>{formatApiKeyDate(apiKey.createdAt)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('api-keys.lastUsed')}</Text>
          <Text style={[typography.caption, typography.numeric, { color: colors.text }]}>{formatApiKeyLastUsed(apiKey.lastUsedAt)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('api-keys.requests')}</Text>
          <Text style={[typography.caption, typography.numeric, { color: colors.text }]}>{formatRequestCount(apiKey.requestCount)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  keyText: {
    fontSize: 12,
  },
  keyActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    minWidth: TOUCH_TARGET_MIN,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaItem: {
    minWidth: '30%',
    gap: 2,
  },
});
