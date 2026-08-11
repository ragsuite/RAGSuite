import { MessageSquare } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ChatWidgetPreview } from '@/features/chatbot-config/components/ChatWidgetPreview';
import { ChatbotConfigPreviewLayout } from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { ChatWidgetConfig } from '@/features/chatbot-config/types/chatbot-config.types';
import { CHATBOT_LANGUAGE_OPTIONS } from '@/features/chatbot-config/utils/chatbot-language-options';
import { useTranslation } from '@/i18n';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const LANGUAGE_OPTIONS = CHATBOT_LANGUAGE_OPTIONS.map((option) => ({
  key: option.key,
  label: option.label,
}));

export function ChatWidgetConfigPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { bundle, loading, saving, handleSaveChatWidgetConfig } = useChatbotConfig();
  const [draft, setDraft] = useState<ChatWidgetConfig | null>(null);

  useEffect(() => {
    if (bundle?.chatWidgetConfig) setDraft(bundle.chatWidgetConfig);
  }, [bundle?.chatWidgetConfig]);

  const customization = bundle?.chatWidgetCustomization;
  const formDisabled = loading || saving;

  if (loading && !bundle?.chatWidgetConfig) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('chatbot.config.loading')}</Text>
      </View>
    );
  }

  return (
    <StatePanel isEmpty={!draft || !customization} emptyLabel={t('chatbot.config.unavailable')}>
      {draft && customization ? (
        <ChatbotConfigPreviewLayout
          preview={
            <ChatWidgetPreview
              config={draft}
              customization={customization}
              avatarOptions={bundle?.avatarOptions}
            />
          }
          form={
            <SearchConfigPanelCard
              icon={MessageSquare}
              title={t('chatbot.config.title')}
              subtitle={t('chatbot.config.description')}>
              <View style={{ gap: spacing.lg }}>
                <AppTextField
                  label={t('chatbot.config.titleLabel')}
                  placeholder={t('chatbot.config.titlePlaceholder')}
                  value={draft.title}
                  editable={!formDisabled}
                  onChangeText={(title) => setDraft((prev) => (prev ? { ...prev, title } : prev))}
                />
                <AppTextField
                  label={t('chatbot.config.bubbleMessageLabel')}
                  placeholder={t('chatbot.config.bubbleMessagePlaceholder')}
                  value={draft.bubbleMessage}
                  editable={!formDisabled}
                  onChangeText={(bubbleMessage) =>
                    setDraft((prev) => (prev ? { ...prev, bubbleMessage, launcherLabel: bubbleMessage } : prev))
                  }
                />
                <AppTextField
                  label={t('chatbot.config.welcomeMessageLabel')}
                  placeholder={t('chatbot.config.welcomeMessagePlaceholder')}
                  value={draft.welcomeMessage}
                  editable={!formDisabled}
                  onChangeText={(welcomeMessage) =>
                    setDraft((prev) => (prev ? { ...prev, welcomeMessage, greeting: welcomeMessage } : prev))
                  }
                />
                <AppSelectField
                  label={t('chatbot.config.languageLabel')}
                  value={draft.language}
                  options={LANGUAGE_OPTIONS}
                  onChange={(language) => setDraft((prev) => (prev ? { ...prev, language } : prev))}
                />
                <SearchConfigSaveButton
                  label={saving ? t('chatbot.config.saving') : t('chatbot.config.save')}
                  disabled={formDisabled}
                  loading={saving}
                  onPress={() => void handleSaveChatWidgetConfig(draft)}
                />
              </View>
            </SearchConfigPanelCard>
          }
        />
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
});
