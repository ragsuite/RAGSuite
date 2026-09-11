import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import type { FaqSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { visibleFaqQuestions } from '@/features/chatbot-config/utils/faq-settings';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  faqSettings: FaqSettings | null | undefined;
  theme: AppChatWidgetTheme;
  fontSize: number;
  disabled?: boolean;
  onSelect: (questionText: string) => void;
};

export function AppChatWidgetFaqChips({
  faqSettings,
  theme,
  fontSize,
  disabled = false,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const { spacing, typography } = useAppTheme();
  const chipFontSize = Math.max(11, fontSize - 2);

  if (!faqSettings?.enabled) return null;
  const questions = visibleFaqQuestions(faqSettings);
  if (questions.length === 0) return null;

  return (
    <View
      style={[styles.wrap, { gap: spacing.xs }]}
      accessibilityRole="list">
      {questions.map((question) => (
        <Pressable
          key={question.id}
          accessibilityRole="button"
          accessibilityLabel={t('chatbot.faq.chip.a11y', { question: question.text })}
          disabled={disabled}
          onPress={() => onSelect(question.text)}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: theme.panelBorderColor,
              backgroundColor: pressed ? theme.inputSectionBg : theme.assistantBubbleBg,
              opacity: disabled ? 0.55 : 1,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
            },
          ]}>
          <Text
            style={[
              typography.body,
              {
                color: theme.assistantTextColor,
                fontSize: chipFontSize,
                lineHeight: Math.round(chipFontSize * 1.35),
              },
            ]}
            numberOfLines={3}>
            {question.text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'flex-start',
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
});
