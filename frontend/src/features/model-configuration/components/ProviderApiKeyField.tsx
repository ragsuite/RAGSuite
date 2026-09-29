import React from 'react';
import { Text, View } from 'react-native';

import { ProviderApiKeyConnectionHint } from '@/features/model-configuration/components/ProviderApiKeyConnectionHint';
import type { ProviderDraftController } from '@/features/model-configuration/hooks/useProviderDraft';
import type { ProviderConnectionResult } from '@/features/model-configuration/types/model-configuration.types';
import { hasPendingPlaintextApiKey } from '@/features/search-config/utils/search-model-settings';
import { useTranslation } from '@/i18n';
import { AppTextField } from '@/shared/components/app-text-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  controller: ProviderDraftController;
  onTest: () => Promise<ProviderConnectionResult>;
};

export function ProviderApiKeyField({ controller, onTest }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  const { draft, isOllama, hasSavedApiKey, savedKeyRejected, showingSavedMask, pendingKey } = controller;
  const hasPending = hasPendingPlaintextApiKey(pendingKey);

  const placeholder = isOllama
    ? t('chatbot.models.apiKey.ollamaPlaceholder')
    : hasSavedApiKey
      ? t('chatbot.models.apiKey.savedPlaceholder')
      : t('chatbot.models.apiKey.placeholder');

  const helper = isOllama
    ? t('chatbot.models.apiKey.ollamaHelper')
    : hasSavedApiKey && showingSavedMask
      ? t('models.apiKey.replaceHelper')
      : t('chatbot.models.apiKey.helper');

  return (
    <View style={{ gap: 4 }}>
      <AppTextField
        label={t('chatbot.models.apiKey.label')}
        placeholder={placeholder}
        value={controller.apiKeyFieldValue}
        secureTextEntry={!isOllama && hasPending}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="oneTimeCode"
        importantForAutofill="no"
        editable={!isOllama}
        onFocus={controller.onApiKeyFocus}
        onBlur={controller.onApiKeyBlur}
        onChangeText={controller.onApiKeyChange}
      />
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{helper}</Text>
      <ProviderApiKeyConnectionHint
        isOllama={isOllama}
        savedKeyState={hasSavedApiKey && !hasPending ? (savedKeyRejected ? 'rejected' : 'saved') : null}
        resetKey={`${draft.apiKey}|${draft.chatModel}|${draft.embeddingModel}`}
        onTest={onTest}
      />
    </View>
  );
}
