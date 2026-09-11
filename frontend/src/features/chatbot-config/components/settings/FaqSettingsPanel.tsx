import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { HelpCircle, X } from 'lucide-react-native';

import { ChatWidgetPreview } from '@/features/chatbot-config/components/ChatWidgetPreview';
import { ChatbotConfigPreviewLayout } from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { FaqQuestion, FaqSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { clampFaqQuestionLimit, FAQ_QUESTION_LIMIT_DEFAULT } from '@/features/chatbot-config/utils/faq-settings';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { SEARCH_CONFIG_TOUCH_MIN } from '@/features/search-config/utils/search-config-mobile';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

export function FaqSettingsPanel() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { bundle, loading, saving, handleSaveFaqSettings } = useChatbotConfig();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<FaqSettings | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    if (bundle?.faqSettings) {
      setDraft({
        ...bundle.faqSettings,
        questions: bundle.faqSettings.questions.map((q) => ({ ...q })),
      });
      setEditingId(null);
      setEditingText('');
    }
  }, [bundle?.faqSettings]);

  const dirty =
    draft && bundle
      ? JSON.stringify(draft) !== JSON.stringify(bundle.faqSettings)
      : false;

  const config = bundle?.chatWidgetConfig;
  const customization = bundle?.chatWidgetCustomization;
  const limit = draft ? clampFaqQuestionLimit(draft.questionLimit) : FAQ_QUESTION_LIMIT_DEFAULT;
  const atLimit = draft ? draft.questions.length >= limit : false;
  const formDisabled = loading || saving;

  const addQuestion = () => {
    const text = newQuestion.trim();
    if (!text || !draft || atLimit) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            questions: [
              ...prev.questions,
              { id: `faq_${Date.now()}`, text, order: prev.questions.length + 1 },
            ],
          }
        : prev,
    );
    setNewQuestion('');
  };

  const removeQuestion = (id: string) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions
              .filter((q) => q.id !== id)
              .map((q, index) => ({ ...q, order: index + 1 })),
          }
        : prev,
    );
    if (editingId === id) {
      setEditingId(null);
      setEditingText('');
    }
  };

  const startEdit = (question: FaqQuestion) => {
    setEditingId(question.id);
    setEditingText(question.text);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const text = editingText.trim();
    if (!text) {
      removeQuestion(editingId);
      return;
    }
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions.map((q) => (q.id === editingId ? { ...q, text } : q)),
          }
        : prev,
    );
    setEditingId(null);
    setEditingText('');
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
                        const parsed = Number.parseInt(text, 10);
                        if (text === '') {
                          setDraft((prev) =>
                            prev ? { ...prev, questionLimit: FAQ_QUESTION_LIMIT_DEFAULT } : prev,
                          );
                          return;
                        }
                        if (!Number.isNaN(parsed)) {
                          setDraft((prev) => (prev ? { ...prev, questionLimit: parsed } : prev));
                        }
                      }}
                      rightAdornment={
                        draft.questionLimit ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('chatbot.faq.limit.clear')}
                            onPress={() =>
                              setDraft((prev) =>
                                prev ? { ...prev, questionLimit: FAQ_QUESTION_LIMIT_DEFAULT } : prev,
                              )
                            }
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

                    <View style={{ gap: spacing.xs }}>
                      <Text style={[typography.fieldLabel, { color: colors.text }]}>
                        {t('chatbot.faq.list.label')}
                      </Text>
                      <View style={[styles.addRow, { gap: spacing.xs }]}>
                        <View
                          style={[
                            styles.addInputWrap,
                            {
                              flex: 1,
                              borderColor: colors.border,
                              borderRadius: surfaceRadius.input,
                              backgroundColor: colors.surfaceMuted,
                            },
                          ]}>
                          <TextInput
                            accessibilityLabel={t('chatbot.faq.list.placeholder')}
                            placeholder={t('chatbot.faq.list.placeholder')}
                            placeholderTextColor={colors.textMuted}
                            value={newQuestion}
                            editable={!formDisabled}
                            onChangeText={setNewQuestion}
                            onSubmitEditing={addQuestion}
                            returnKeyType="done"
                            style={[
                              getInputTextStyle(typography.fieldInput, { includeHorizontalPadding: false }),
                              styles.addInput,
                              { color: colors.text },
                            ]}
                          />
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('chatbot.faq.list.add')}
                          disabled={!newQuestion.trim() || atLimit || formDisabled}
                          onPress={addQuestion}
                          style={({ pressed }) => [
                            styles.addBtn,
                            {
                              minHeight: SEARCH_CONFIG_TOUCH_MIN,
                              minWidth: SEARCH_CONFIG_TOUCH_MIN,
                              borderRadius: surfaceRadius.button,
                              borderColor: colors.border,
                              backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                              opacity: !newQuestion.trim() || atLimit || formDisabled ? 0.45 : 1,
                            },
                          ]}>
                          <ActionIcons.add size={20} color={colors.text} />
                        </Pressable>
                      </View>
                      {atLimit ? (
                        <Text style={[typography.caption, { color: colors.textMuted }]}>
                          {t('chatbot.faq.list.limitReached', { limit })}
                        </Text>
                      ) : null}
                    </View>

                    {draft.questions.length > 0 ? (
                      <View style={{ gap: spacing.xs }}>
                        {draft.questions.map((question) => {
                          const isEditing = editingId === question.id;
                          return (
                            <View
                              key={question.id}
                              style={[
                                styles.questionRow,
                                {
                                  borderColor: colors.border,
                                  borderRadius: surfaceRadius.button,
                                  backgroundColor: colors.surfaceMuted,
                                  paddingHorizontal: spacing.sm,
                                  paddingVertical: spacing.sm,
                                  gap: spacing.sm,
                                },
                              ]}>
                              {isEditing ? (
                                <TextInput
                                  accessibilityLabel={t('chatbot.faq.list.edit')}
                                  autoFocus
                                  value={editingText}
                                  onChangeText={setEditingText}
                                  onSubmitEditing={commitEdit}
                                  returnKeyType="done"
                                  style={[
                                    getInputTextStyle(typography.fieldInput, {
                                      includeHorizontalPadding: false,
                                    }),
                                    styles.editInput,
                                    { color: colors.text, flex: 1 },
                                  ]}
                                />
                              ) : (
                                <Text
                                  style={[typography.body, { color: colors.text, flex: 1 }]}
                                  numberOfLines={3}>
                                  {question.text}
                                </Text>
                              )}
                              <View style={[styles.rowActions, { gap: spacing.xs }]}>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={t('chatbot.faq.list.editA11y', {
                                    order: question.order,
                                  })}
                                  onPress={() => (isEditing ? commitEdit() : startEdit(question))}
                                  hitSlop={6}
                                  style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.65 : 1 }]}>
                                  <ActionIcons.edit size={18} color={colors.text} />
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={t('chatbot.faq.list.deleteA11y', {
                                    order: question.order,
                                  })}
                                  onPress={() => removeQuestion(question.id)}
                                  hitSlop={6}
                                  style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.65 : 1 }]}>
                                  <ActionIcons.delete size={18} color={colors.danger} />
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </>
                ) : null}

                <SearchConfigSaveButton
                  label={saving ? t('chatbot.config.saving') : t('chatbot.faq.save')}
                  disabled={formDisabled || !dirty}
                  loading={saving}
                  onPress={() => draft && void handleSaveFaqSettings(draft)}
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
  addRow: { flexDirection: 'row', alignItems: 'stretch' },
  addInputWrap: { borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  addInput: { minWidth: 0 },
  addBtn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  questionRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  editInput: { minWidth: 0 },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 4 },
  clearHit: { paddingHorizontal: 8 },
});
