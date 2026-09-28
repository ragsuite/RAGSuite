import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTextField } from '@/shared/components/app-text-field';
import { ActionIcons } from '@/shared/constants/action-icons';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

import type { FaqEditorLengths } from './faq-editor.types';

type Props = FaqEditorLengths & {
  disabled: boolean;
  atLimit: boolean;
  limit: number;
  onAdd: (question: string, answer: string) => void;
};

export function FaqQuestionComposer({
  disabled,
  atLimit,
  limit,
  questionMaxLength,
  answerMaxLength,
  onAdd,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const canAdd = !disabled && !atLimit && Boolean(question.trim()) && Boolean(answer.trim());

  const submit = () => {
    if (!canAdd) return;
    onAdd(question.trim(), answer.trim());
    setQuestion('');
    setAnswer('');
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <AppTextField
        label={t('faq.editor.questionLabel')}
        accessibilityLabel={t('faq.editor.placeholder')}
        placeholder={t('faq.editor.placeholder')}
        value={question}
        maxLength={questionMaxLength}
        editable={!disabled && !atLimit}
        onChangeText={setQuestion}
        returnKeyType="next"
      />
      <AppTextField
        label={t('faq.editor.answerLabel')}
        accessibilityLabel={t('faq.editor.answerPlaceholder')}
        placeholder={t('faq.editor.answerPlaceholder')}
        value={answer}
        maxLength={answerMaxLength}
        editable={!disabled && !atLimit}
        onChangeText={setAnswer}
        multiline
        numberOfLines={4}
      />
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        {atLimit ? t('faq.editor.limitReached', { limit }) : t('faq.editor.answerHelper')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('faq.editor.add')}
        accessibilityState={{ disabled: !canAdd }}
        disabled={!canAdd}
        onPress={submit}
        style={({ pressed }) => [
          styles.addBtn,
          {
            minHeight: TOUCH_TARGET_MIN,
            gap: spacing.xs,
            paddingHorizontal: spacing.md,
            borderRadius: surfaceRadius.button,
            borderColor: colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
            opacity: canAdd ? 1 : 0.45,
          },
        ]}>
        <ActionIcons.add size={18} color={colors.text} />
        <Text style={[typography.body, { color: colors.text }]}>{t('faq.editor.add')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
