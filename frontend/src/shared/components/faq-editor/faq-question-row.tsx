import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/shared/components/app-button';
import { AppSecondaryButton } from '@/shared/components/app-secondary-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

import type { FaqEditorItem, FaqEditorItemPatch, FaqEditorLengths } from './faq-editor.types';
import { isFaqItemAnswerMissing } from './faq-editor.utils';

type Props = FaqEditorLengths & {
  item: FaqEditorItem;
  disabled: boolean;
  onChange: (id: string, patch: FaqEditorItemPatch) => void;
  onRemove: (id: string) => void;
};

export function FaqQuestionRow({
  item,
  disabled,
  questionMaxLength,
  answerMaxLength,
  onChange,
  onRemove,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [answer, setAnswer] = useState(item.answer);
  const answerMissing = isFaqItemAnswerMissing(item);
  const canSave = Boolean(text.trim()) && Boolean(answer.trim());

  const startEdit = () => {
    setText(item.text);
    setAnswer(item.answer);
    setEditing(true);
  };

  const cancelEdit = () => {
    setText(item.text);
    setAnswer(item.answer);
    setEditing(false);
  };

  const saveEdit = () => {
    if (!canSave) return;
    onChange(item.id, { text: text.trim(), answer: answer.trim() });
    setEditing(false);
  };

  return (
    <View
      style={[
        styles.row,
        {
          borderColor: answerMissing && !editing ? colors.danger : colors.border,
          borderRadius: surfaceRadius.button,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        },
      ]}>
      <View style={[styles.content, { gap: spacing.xs }]}>
        {editing ? (
          <>
            <AppTextField
              label={t('faq.editor.questionLabel')}
              accessibilityLabel={t('faq.editor.edit')}
              autoFocus
              value={text}
              maxLength={questionMaxLength}
              onChangeText={setText}
              returnKeyType="next"
            />
            <AppTextField
              label={t('faq.editor.answerLabel')}
              accessibilityLabel={t('faq.editor.answerPlaceholder')}
              placeholder={t('faq.editor.answerPlaceholder')}
              value={answer}
              maxLength={answerMaxLength}
              onChangeText={setAnswer}
              multiline
              numberOfLines={4}
            />
            <View style={[styles.editActions, { gap: spacing.xs, paddingTop: spacing.xs }]}>
              <AppSecondaryButton
                label={t('common.cancel')}
                onPress={cancelEdit}
                disabled={disabled}
                noTopMargin
              />
              <AppButton
                label={t('common.save')}
                accessibilityLabel={t('faq.editor.saveEditA11y', { order: item.order })}
                onPress={saveEdit}
                disabled={disabled || !canSave}
                size="compact"
                variant="cta"
                icon={ActionIcons.save}
                noTopMargin
              />
            </View>
          </>
        ) : (
          <>
            <Text style={[typography.body, { color: colors.text }]} numberOfLines={3}>
              {item.text}
            </Text>
            {answerMissing ? (
              <Text style={[typography.caption, { color: colors.danger }]}>
                {t('faq.editor.answerRequired')}
              </Text>
            ) : (
              <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
                {item.answer}
              </Text>
            )}
          </>
        )}
      </View>
      <View style={[styles.actions, { gap: spacing.xs }]}>
        {editing ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('faq.editor.editA11y', { order: item.order })}
            disabled={disabled}
            onPress={startEdit}
            hitSlop={6}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.65 : 1 }]}>
            <ActionIcons.edit size={18} color={colors.text} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('faq.editor.deleteA11y', { order: item.order })}
          disabled={disabled}
          onPress={() => onRemove(item.id)}
          hitSlop={6}
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.65 : 1 }]}>
          <ActionIcons.delete size={18} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1 },
  content: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
  iconBtn: { padding: 4 },
});
