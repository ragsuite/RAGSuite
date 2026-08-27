import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Plug, XCircle } from 'lucide-react-native';

import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import {
  formatConnectionTestError,
  isOllamaProvider,
} from '@/features/search-config/utils/search-model-settings';
import { isMaskedApiKey } from '@/features/search-config/utils/search-settings-api';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  provider: string;
  apiKey: string;
  chatModel?: string;
  embeddingModel?: string;
  hasSavedApiKey?: boolean;
};

export function ChatbotModelApiKeyConnectionHint({
  provider,
  apiKey,
  chatModel,
  embeddingModel,
  hasSavedApiKey = false,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const successColor = colors.success;
  const { handleTestModelConnection } = useChatbotConfig();
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const isOllama = isOllamaProvider(provider);
  const showSavedBadge = hasSavedApiKey && (!apiKey.trim() || isMaskedApiKey(apiKey));

  useEffect(() => {
    setStatus('idle');
    setMessage('');
  }, [provider, apiKey, chatModel, embeddingModel]);

  const handleTest = async () => {
    if (isOllama) return;

    setStatus('testing');
    setMessage('');

    try {
      const result = await handleTestModelConnection(
        {
          provider,
          chatModel: chatModel ?? '',
          embeddingModel: embeddingModel ?? '',
          apiKey,
        },
        { hasSavedApiKey },
      );
      if (result.ok) {
        setStatus('success');
        setMessage(result.message);
      } else {
        setStatus('error');
        setMessage(formatConnectionTestError(result.message));
      }
    } catch (error) {
      setStatus('error');
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(formatConnectionTestError(detail));
    }
  };

  if (isOllama) {
    return (
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
        {t('models.apiKey.test.ollamaNoTest')}
      </Text>
    );
  }

  return (
    <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        {showSavedBadge ? (
          <View style={[styles.row, { gap: 4 }]}>
            <CheckCircle2 size={14} color={successColor} />
            <Text style={[typography.caption, { color: successColor }]}>{t('models.apiKey.savedHint')}</Text>
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
              <Text style={[typography.caption, { color: colors.primary, fontWeight: '500' }]}>
                {t('models.apiKey.test.button')}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {status === 'success' && message ? (
        <View style={[styles.row, { gap: 4 }]}>
          <CheckCircle2 size={12} color={successColor} />
          <Text style={[typography.caption, { color: successColor }]}>{message}</Text>
        </View>
      ) : null}

      {status === 'error' && message ? (
        <View style={[styles.row, { gap: 4, alignItems: 'flex-start' }]}>
          <XCircle size={12} color={colors.danger} style={{ marginTop: 2 }} />
          <Text style={[typography.caption, { color: colors.danger, flex: 1 }]}>{message}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
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
