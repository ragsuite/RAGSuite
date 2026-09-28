import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HelpCircle, X } from 'lucide-react-native';

import { ChatWidgetPreview } from '@/features/chatbot-config/components/ChatWidgetPreview';
import { ChatbotConfigPreviewLayout } from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { FaqQuestion, FaqSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import {
  clampFaqQuestionLimit,
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_QUESTION_LIMIT_DEFAULT,
  FAQ_QUESTION_MAX_LENGTH,
  faqQuestionsMissingAnswers,
} from '@/features/chatbot-config/utils/faq-settings';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FaqEditorList } from '@/shared/components/faq-editor';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function FaqSettingsPanel() {
  const { colors, spacing, typography } = useAppTheme();
  const { bundle, loading, saving, handleSaveFaqSettings } = useChatbotConfig();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<FaqSettings | null>(null);

  useEffect(() => {
    if (bundle?.faqSettings) {
      setDraft({
        ...bundle.faqSettings,
        questions: bundle.faqSettings.questions.map((q) => ({ ...q })),
      });
    }
  }, [bundle?.faqSettings]);

  const dirty =
    draft && bundle
      ? JSON.stringify(draft) !== JSON.stringify(bundle.faqSettings)
      : false;

  const config = bundle?.chatWidgetConfig;
  const customization = bundle?.chatWidgetCustomization;
  const limit = draft ? clampFaqQuestionLimit(draft.questionLimit) : FAQ_QUESTION_LIMIT_DEFAULT;
  const formDisabled = loading || saving;
  const saveBlocked = draft ? draft.enabled && faqQuestionsMissingAnswers(draft).length > 0 : false;

  const setQuestions = (questions: FaqQuestion[]) => {
    setDraft((prev) => (prev ? { ...prev, questions } : prev));
  };

  const setQuestionLimit = (questionLimit: number) => {
    setDraft((prev) => (prev ? { ...prev, questionLimit } : prev));
  };

  if (loading && !bundle?.faqSettings) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('chatbot.faq.loading')}</Text>
      </View>
    );
  }

  return (
    <StatePanel isEmpty={!draft || !config || !customization} emptyLabel={t('chatbot.faq.unavailable')}>
      {draft && config && customization ? (
        <ChatbotConfigPreviewLayout
          preview={
            <ChatWidgetPreview
              config={config}
              customization={customization}
              avatarOptions={bundle?.avatarOptions}
              faqSettings={draft}
            />
          }
          form={
            <SearchConfigPanelCard
              icon={HelpCircle}
              title={t('chatbot.faq.title')}
              subtitle={t('chatbot.faq.description')}>
              <View style={{ gap: spacing.md }}>
                <AppSwitchRow
                  bordered={false}
                  label={t('chatbot.faq.enable.label')}
                  description={t('chatbot.faq.enable.helper')}
                  value={draft.enabled}
                  disabled={formDisabled}
                  onChange={(enabled) => setDraft((prev) => (prev ? { ...prev, enabled } : prev))}
                />

                {draft.enabled ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <AppTextField
                      label={t('chatbot.faq.limit.label')}
                      value={String(draft.questionLimit)}
                      keyboardType="number-pad"
                      editable={!formDisabled}
                      onChangeText={(text) => {
                        if (text === '') {
                          setQuestionLimit(FAQ_QUESTION_LIMIT_DEFAULT);
                          return;
                        }
                        const parsed = Number.parseInt(text, 10);
                        if (!Number.isNaN(parsed)) setQuestionLimit(parsed);
                      }}
                      rightAdornment={
                        draft.questionLimit ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('chatbot.faq.limit.clear')}
                            onPress={() => setQuestionLimit(FAQ_QUESTION_LIMIT_DEFAULT)}
                            hitSlop={8}
                            style={styles.clearHit}>
                            <X size={16} color={colors.textMuted} />
                          </Pressable>
                        ) : null
                      }
                    />
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {t('chatbot.faq.limit.helper')}
                    </Text>

                    <FaqEditorList
                      items={draft.questions}
                      limit={limit}
                      disabled={formDisabled}
                      saveBlocked={saveBlocked}
                      idPrefix="faq"
                      questionMaxLength={FAQ_QUESTION_MAX_LENGTH}
                      answerMaxLength={FAQ_ANSWER_MAX_LENGTH}
                      onItemsChange={setQuestions}
                    />
                  </>
                ) : null}

                <SearchConfigSaveButton
                  label={saving ? t('chatbot.config.saving') : t('chatbot.faq.save')}
                  disabled={formDisabled || !dirty || saveBlocked}
                  loading={saving}
                  onPress={() => draft && !saveBlocked && void handleSaveFaqSettings(draft)}
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
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  clearHit: { paddingHorizontal: 8 },
});
