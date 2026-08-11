import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';

import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchBoxPreview } from '@/features/search-config/components/SearchBoxPreview';
import { SearchConfigPreviewLayout } from '@/features/search-config/components/SearchConfigPreviewLayout';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type {
  PredefinedQuestion,
  PredefinedQuestionsSettings,
} from '@/features/search-config/types/search-config.types';
import { clampQuestionLimit } from '@/features/search-config/utils/predefined-questions';
import { SEARCH_CONFIG_TOUCH_MIN } from '@/features/search-config/utils/search-config-mobile';
import { AppButton } from '@/shared/components/app-button';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';
import { ActionIcons } from '@/shared/constants/action-icons';

export function PredefinedQuestionsPanel() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { bundle, saving, handleSavePredefinedQuestions } = useSearchConfig();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PredefinedQuestionsSettings | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingAnswer, setEditingAnswer] = useState('');

  useEffect(() => {
    if (bundle?.predefinedQuestions) {
      setDraft(bundle.predefinedQuestions);
      setEditingId(null);
      setEditingText('');
      setEditingAnswer('');
    }
  }, [bundle?.predefinedQuestions]);

  const dirty =
    draft && bundle ? JSON.stringify(draft) !== JSON.stringify(bundle.predefinedQuestions) : false;

  const config = bundle?.searchBoxConfig;
  const customization = bundle?.searchBoxCustomization;
  const limit = draft ? clampQuestionLimit(draft.questionLimit) : 5;
  const atLimit = draft ? draft.questions.length >= limit : false;

  const addQuestion = () => {
    const text = newQuestion.trim();
    if (!text || !draft || atLimit) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            questions: [
              ...prev.questions,
              { id: `pq_${Date.now()}`, text, order: prev.questions.length + 1 },
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
      setEditingAnswer('');
    }
  };

  const startEdit = (question: PredefinedQuestion) => {
    setEditingId(question.id);
    setEditingText(question.text);
    setEditingAnswer(question.answer ?? '');
  };

  const commitEdit = () => {
    if (!editingId) return;
    const text = editingText.trim();
    if (!text) {
      removeQuestion(editingId);
      return;
    }
    const answer = editingAnswer.trim();
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions.map((q) =>
              q.id === editingId ? { ...q, text, ...(answer ? { answer } : { answer: undefined }) } : q,
            ),
          }
        : prev,
    );
    setEditingId(null);
    setEditingText('');
    setEditingAnswer('');
  };

  const questionsForm = draft ? (
    <View style={{ gap: spacing.md }}>
      <AppSwitchRow
        bordered={false}
        label={t('search.questions.enable.label')}
        description={t('search.questions.enable.helper')}
        value={draft.enabled}
        onChange={(enabled) => setDraft((prev) => (prev ? { ...prev, enabled } : prev))}
      />

      {draft.enabled ? (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <AppTextField
            label={t('search.questions.limit.label')}
            value={String(draft.questionLimit)}
            keyboardType="number-pad"
            onChangeText={(text) => {
              const parsed = Number.parseInt(text, 10);
              if (text === '') {
                setDraft((prev) => (prev ? { ...prev, questionLimit: 5 } : prev));
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
                  accessibilityLabel="Clear question limit"
                  onPress={() => setDraft((prev) => (prev ? { ...prev, questionLimit: 5 } : prev))}
                  hitSlop={8}
                  style={styles.clearHit}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null
            }
          />

          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.fieldLabel, { color: colors.text }]}>Questions</Text>
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
                  accessibilityLabel="New predefined question"
                  placeholder={t('search.questions.list.placeholder')}
                  placeholderTextColor={colors.textMuted}
                  value={newQuestion}
                  onChangeText={setNewQuestion}
                  onSubmitEditing={addQuestion}
                  returnKeyType="done"
                  style={[getInputTextStyle(typography.fieldInput, { includeHorizontalPadding: false }), styles.addInput, { color: colors.text }]}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add question"
                disabled={!newQuestion.trim() || atLimit}
                onPress={addQuestion}
                style={({ pressed }) => [
                  styles.addBtn,
                  {
                    minHeight: SEARCH_CONFIG_TOUCH_MIN,
                    minWidth: SEARCH_CONFIG_TOUCH_MIN,
                    borderRadius: surfaceRadius.button,
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    opacity: !newQuestion.trim() || atLimit ? 0.45 : 1,
                  },
                ]}>
                <ActionIcons.add size={20} color={colors.text} />
              </Pressable>
            </View>
            {atLimit ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                Question limit reached ({limit}).
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
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <TextInput
                          accessibilityLabel="Edit question"
                          autoFocus
                          value={editingText}
                          onChangeText={setEditingText}
                          returnKeyType="next"
                          style={[getInputTextStyle(typography.fieldInput, { includeHorizontalPadding: false }), styles.editInput, { color: colors.text }]}
                        />
                        <TextInput
                          accessibilityLabel="Predefined answer"
                          value={editingAnswer}
                          onChangeText={setEditingAnswer}
                          onSubmitEditing={commitEdit}
                          placeholder={t('search.questions.answer.testPlaceholder')}
                          placeholderTextColor={colors.textMuted}
                          multiline
                          textAlignVertical="top"
                          style={[
                            typography.body,
                            styles.editInput,
                            styles.answerInput,
                            { color: colors.text, minHeight: 72 },
                          ]}
                        />
                      </View>
                    ) : (
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]} numberOfLines={3}>
                        {question.text}
                      </Text>
                    )}
                    <View style={[styles.rowActions, { gap: spacing.xs }]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit question ${question.order}`}
                        onPress={() => (isEditing ? commitEdit() : startEdit(question))}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.iconBtn,
                          { opacity: pressed ? 0.65 : 1 },
                        ]}>
                        <ActionIcons.edit size={18} color={colors.text} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete question ${question.order}`}
                        onPress={() => removeQuestion(question.id)}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.iconBtn,
                          { opacity: pressed ? 0.65 : 1 },
                        ]}>
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

      <AppButton
        variant="cta"
        size="compact"
        label="Save Changes"
        icon={ActionIcons.save}
        loading={saving}
        disabled={!dirty || saving}
        onPress={() => draft && void handleSavePredefinedQuestions(draft)}
      />
    </View>
  ) : null;

  return (
    <StatePanel isEmpty={!draft || !config} emptyLabel="Predefined questions unavailable.">
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
              {questionsForm}
            </SearchConfigPanelCard>
          }
        />
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  fieldLabel: { marginBottom: 4 },
  addRow: { flexDirection: 'row', alignItems: 'stretch' },
  addInputWrap: { borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  addInput: { minWidth: 0 },
  addBtn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  questionRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  editInput: { minWidth: 0 },
  answerInput: { width: '100%' },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 4 },
  clearHit: { paddingHorizontal: 8 },
});
