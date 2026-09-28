import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { SearchBoxPreview } from '@/features/search-config/components/SearchBoxPreview';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigPreviewLayout } from '@/features/search-config/components/SearchConfigPreviewLayout';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type {
  PredefinedQuestion,
  PredefinedQuestionsSettings,
} from '@/features/search-config/types/search-config.types';
import {
  clampQuestionLimit,
  SEARCH_FAQ_ANSWER_MAX_LENGTH,
  SEARCH_FAQ_LIMIT_DEFAULT,
  SEARCH_FAQ_QUESTION_MAX_LENGTH,
  searchFaqQuestionsMissingAnswers,
} from '@/features/search-config/utils/predefined-questions';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FaqEditorList } from '@/shared/components/faq-editor';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Search FAQ settings (route and i18n keys keep the legacy "predefined questions" name). */
export function PredefinedQuestionsPanel() {
  const { colors, spacing, typography } = useAppTheme();
  const { bundle, loading, saving, handleSavePredefinedQuestions } = useSearchConfig();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PredefinedQuestionsSettings | null>(null);

  useEffect(() => {
    if (bundle?.predefinedQuestions) {
      setDraft({
        ...bundle.predefinedQuestions,
        questions: bundle.predefinedQuestions.questions.map((q) => ({ ...q })),
      });
    }
  }, [bundle?.predefinedQuestions]);

  const dirty =
    draft && bundle ? JSON.stringify(draft) !== JSON.stringify(bundle.predefinedQuestions) : false;

  const config = bundle?.searchBoxConfig;
  const customization = bundle?.searchBoxCustomization;
  const limit = draft ? clampQuestionLimit(draft.questionLimit) : SEARCH_FAQ_LIMIT_DEFAULT;
  const formDisabled = loading || saving;
  const saveBlocked = draft ? draft.enabled && searchFaqQuestionsMissingAnswers(draft).length > 0 : false;

  const setQuestions = (questions: PredefinedQuestion[]) => {
    setDraft((prev) => (prev ? { ...prev, questions } : prev));
  };

  const setQuestionLimit = (questionLimit: number) => {
    setDraft((prev) => (prev ? { ...prev, questionLimit } : prev));
  };

  if (loading && !bundle?.predefinedQuestions) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('search.questions.loading')}</Text>
      </View>
    );
  }

  return (
    <StatePanel isEmpty={!draft || !config} emptyLabel={t('search.questions.unavailable')}>
      {draft && config ? (
        <SearchConfigPreviewLayout
          preview={
            <SearchBoxPreview
              config={config}
              customization={customization}
              predefinedQuestions={draft}
              previewContext="questions"
            />
          }
          form={
            <SearchConfigPanelCard
              icon={ActionIcons.help}
              title={t('search.questions.title')}
              subtitle={t('search.questions.description')}>
              <View style={{ gap: spacing.md }}>
                <AppSwitchRow
                  bordered={false}
                  label={t('search.questions.enable.label')}
                  description={t('search.questions.enable.helper')}
                  value={draft.enabled}
                  disabled={formDisabled}
                  onChange={(enabled) => setDraft((prev) => (prev ? { ...prev, enabled } : prev))}
                />

                {draft.enabled ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <AppTextField
                      label={t('search.questions.limit.label')}
                      value={String(draft.questionLimit)}
                      keyboardType="number-pad"
                      editable={!formDisabled}
                      onChangeText={(text) => {
                        if (text === '') {
                          setQuestionLimit(SEARCH_FAQ_LIMIT_DEFAULT);
                          return;
                        }
                        const parsed = Number.parseInt(text, 10);
                        if (!Number.isNaN(parsed)) setQuestionLimit(parsed);
                      }}
                      rightAdornment={
                        draft.questionLimit ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('search.questions.limit.clear')}
                            onPress={() => setQuestionLimit(SEARCH_FAQ_LIMIT_DEFAULT)}
                            hitSlop={8}
                            style={styles.clearHit}>
                            <X size={16} color={colors.textMuted} />
                          </Pressable>
                        ) : null
                      }
                    />
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {t('search.questions.limit.helper')}
                    </Text>

                    <FaqEditorList
                      items={draft.questions}
                      limit={limit}
                      disabled={formDisabled}
                      saveBlocked={saveBlocked}
                      idPrefix="pq"
                      questionMaxLength={SEARCH_FAQ_QUESTION_MAX_LENGTH}
                      answerMaxLength={SEARCH_FAQ_ANSWER_MAX_LENGTH}
                      onItemsChange={setQuestions}
                    />
                  </>
                ) : null}

                <SearchConfigSaveButton
                  label={saving ? t('search.config.saving') : t('search.questions.save')}
                  disabled={formDisabled || !dirty || saveBlocked}
                  loading={saving}
                  onPress={() => draft && !saveBlocked && void handleSavePredefinedQuestions(draft)}
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
