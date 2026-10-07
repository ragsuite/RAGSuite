import React from 'react';
import { View } from 'react-native';

import { ProviderApiKeyConnectionHint } from '@/features/model-configuration/components/ProviderApiKeyConnectionHint';
import { ProviderFieldInfo } from '@/features/model-configuration/components/ProviderFieldInfo';
import type { ProviderDraftController } from '@/features/model-configuration/hooks/useProviderDraft';
import type { ProviderConnectionResult } from '@/features/model-configuration/types/model-configuration.types';
import { hasPendingPlaintextApiKey } from '@/features/search-config/utils/search-model-settings';
import { useTranslation } from '@/i18n';
import { AppTextField } from '@/shared/components/app-text-field';

type Props = {
  controller: ProviderDraftController;
  onTest: () => Promise<ProviderConnectionResult>;
};

export function ProviderApiKeyField({ controller, onTest }: Props) {
  const { t } = useTranslation();
  const { draft, isOllama, hasSavedApiKey, savedKeyRejected, pendingKey } = controller;
  const hasPending = hasPendingPlaintextApiKey(pendingKey);

  const placeholder = isOllama
    ? t('chatbot.models.apiKey.ollamaPlaceholder')
    : hasSavedApiKey
      ? t('chatbot.models.apiKey.savedPlaceholder')
      : t('chatbot.models.apiKey.placeholder');

  return (
    <View style={{ gap: 4 }}>
      <AppTextField
        label={t('chatbot.models.apiKey.label')}
        labelAccessory={
          <ProviderFieldInfo
            titleKey={
              isOllama
                ? 'modelConfiguration.apiKey.ollamaHintTitle'
                : 'modelConfiguration.apiKey.hintTitle'
            }
            bodyKey={
              isOllama
                ? 'modelConfiguration.apiKey.ollamaHintBody'
                : 'modelConfiguration.apiKey.hintBody'
            }
          />
        }
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
      <ProviderApiKeyConnectionHint
        isOllama={isOllama}
        savedKeyState={hasSavedApiKey && !hasPending ? (savedKeyRejected ? 'rejected' : 'saved') : null}
        resetKey={`${draft.apiKey}|${draft.chatModel}|${draft.embeddingModel}`}
        onTest={onTest}
      />
    </View>
  );
}
