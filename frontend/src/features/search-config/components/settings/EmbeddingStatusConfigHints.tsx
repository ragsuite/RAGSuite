import React from 'react';
import { Text } from 'react-native';

import type { EmbeddingStatus } from '@/features/search-config/types/embedding.types';
import {
  embeddingStatusSavedProvider,
  embeddingStatusShowsApiKeyHints,
  embeddingStatusShowsFallbackMismatch,
} from '@/features/search-config/utils/embedding-status-hints';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Namespace = 'chatbot' | 'search';

type Props = {
  status: EmbeddingStatus;
  namespace: Namespace;
  textColor: string;
};

/**
 * Shared lines for Model Settings embedding banners: saved vs runtime mismatch
 * and whether the hosted provider API key is already configured.
 */
export function EmbeddingStatusConfigHints({ status, namespace, textColor }: Props) {
  const { t } = useTranslation();
  const { typography } = useAppTheme();
  const provider = embeddingStatusSavedProvider(status) || status.active_provider;
  const savedModel = (status.saved_model || '').trim() || status.active_model;
  const showFallback = embeddingStatusShowsFallbackMismatch(status);
  const showApiKey = embeddingStatusShowsApiKeyHints(status);
  const keyConfigured = Boolean(status.api_key_configured);

  if (!showFallback && !showApiKey) return null;

  const captionStyle = [typography.caption, { color: textColor, lineHeight: 18 }];

  return (
    <>
      {showFallback ? (
        <Text style={captionStyle}>
          {t(`${namespace}.embedding.status.fallbackWarning`, {
            model: status.active_model,
            savedModel,
            provider,
          })}
        </Text>
      ) : null}
      {showApiKey ? (
        <Text style={captionStyle}>
          {keyConfigured
            ? t(`${namespace}.embedding.status.apiKeyConfigured`, { provider })
            : t(`${namespace}.embedding.status.apiKeyMissing`, {
                provider,
                savedModel,
              })}
        </Text>
      ) : null}
    </>
  );
}
