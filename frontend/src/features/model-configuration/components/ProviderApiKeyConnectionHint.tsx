import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Plug, XCircle } from 'lucide-react-native';

import type { ProviderConnectionResult } from '@/features/model-configuration/types/model-configuration.types';
import { formatConnectionTestError } from '@/features/search-config/utils/search-model-settings';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  isOllama: boolean;
  /** Stored key status next to Test connection; null while a new key is being typed. */
  savedKeyState: 'saved' | 'rejected' | null;
  /** Any change to this value clears a previous test result. */
  resetKey: string;
  onTest: () => Promise<ProviderConnectionResult>;
  onTestComplete?: () => void;
};

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export function ProviderApiKeyConnectionHint({ isOllama, savedKeyState, resetKey, onTest, onTestComplete }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [status, setStatus] = useState<TestStatus>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setStatus('idle');
    setMessage('');
  }, [resetKey]);

  const handleTest = async () => {
    setStatus('testing');
    setMessage('');
    try {
      const result = await onTest();
      setStatus(result.ok ? 'success' : 'error');
      setMessage(result.ok ? result.message : formatConnectionTestError(result.message));
    } catch (error) {
      setStatus('error');
      setMessage(formatConnectionTestError(error instanceof Error ? error.message : String(error)));
    } finally {
      onTestComplete?.();
    }
  };

  return (
    <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
      {isOllama ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('modelConfiguration.apiKey.ollamaTestHint')}
        </Text>
      ) : null}
      <View style={[styles.row, { gap: spacing.sm }]}>
        {!isOllama && savedKeyState === 'saved' ? (
          <View style={[styles.row, styles.tightGap]}>
            <CheckCircle2 size={14} color={colors.success} />
            <Text style={[typography.caption, { color: colors.success }]}>{t('models.apiKey.savedHint')}</Text>
          </View>
        ) : null}
        {!isOllama && savedKeyState === 'rejected' ? (
          <View style={[styles.row, styles.tightGap]}>
            <XCircle size={14} color={colors.danger} />
            <Text style={[typography.caption, { color: colors.danger }]}>
              {t('modelConfiguration.apiKey.rejected')}
            </Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('models.apiKey.test.a11y')}
          disabled={status === 'testing'}
          onPress={() => void handleTest()}
          style={({ pressed, hovered }) => [
            styles.testBtn,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.button,
              backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
              opacity: status === 'testing' ? 0.65 : 1,
            },
          ]}>
          {status === 'testing' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Plug size={14} color={colors.primary} />
              <Text style={[typography.caption, styles.testLabel, { color: colors.primary }]}>
                {t('models.apiKey.test.button')}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {status === 'success' && message ? (
        <View style={[styles.row, styles.tightGap]}>
          <CheckCircle2 size={12} color={colors.success} />
          <Text style={[typography.caption, { color: colors.success }]}>{message}</Text>
        </View>
      ) : null}

      {status === 'error' && message ? (
        <View style={[styles.row, styles.tightGap, styles.alignStart]}>
          <XCircle size={12} color={colors.danger} style={styles.errorIcon} />
          <Text style={[typography.caption, styles.flex, { color: colors.danger }]}>{message}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  tightGap: { gap: 4 },
  alignStart: { alignItems: 'flex-start' },
  errorIcon: { marginTop: 2 },
  flex: { flex: 1 },
  testLabel: { fontWeight: '500' },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
  },
});
