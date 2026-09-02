import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ThumbsUp } from 'lucide-react-native';

import { ChatWidgetPreview } from '@/features/chatbot-config/components/ChatWidgetPreview';
import { ChatbotConfigPreviewLayout } from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { FeedbackSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { useTranslation } from '@/i18n';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const FEEDBACK_LABEL = 'chatbot.config.feedbackEnabled.label';
const FEEDBACK_DESCRIPTION = 'chatbot.config.feedbackEnabled.description';

export function FeedbackSettingsPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { bundle, loading, saving, handleSaveFeedbackSettings } = useChatbotConfig();
  const [draft, setDraft] = useState<FeedbackSettings | null>(null);

  useEffect(() => {
    if (bundle?.feedbackSettings) setDraft(bundle.feedbackSettings);
  }, [bundle?.feedbackSettings]);

  const config = bundle?.chatWidgetConfig;
  const customization = bundle?.chatWidgetCustomization;
  const formDisabled = loading || saving;

  const onSave = () => {
    if (!draft) return;
    void handleSaveFeedbackSettings(draft);
  };

  if (loading && !bundle?.feedbackSettings) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('chatbot.config.loading')}</Text>
      </View>
    );
  }

  return (
    <StatePanel isEmpty={!draft || !config || !customization} emptyLabel={t('chatbot.feedback.unavailable')}>
      {draft && config && customization ? (
        <ChatbotConfigPreviewLayout
          preview={
            <ChatWidgetPreview
              config={config}
              customization={customization}
              avatarOptions={bundle?.avatarOptions}
              feedbackEnabled={draft.collectFeedback}
            />
          }
          form={
            <SearchConfigPanelCard icon={ThumbsUp} title={t('chatbot.settings.feedback')} subtitle="">
              <View style={{ gap: spacing.lg }}>
                <AppSwitchRow
                  bordered
                  label={t(FEEDBACK_LABEL)}
                  description={t(FEEDBACK_DESCRIPTION)}
                  value={draft.collectFeedback}
                  disabled={formDisabled}
                  onChange={(collectFeedback) =>
                    setDraft((prev) => (prev ? { ...prev, collectFeedback } : prev))
                  }
                />
                <SearchConfigSaveButton
                  label={saving ? t('chatbot.config.saving') : t('chatbot.config.save')}
                  disabled={formDisabled}
                  loading={saving}
                  onPress={onSave}
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
