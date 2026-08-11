import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

function InlineCode({ children }: { children: string }) {
  const { colors, surfaceRadius, fonts } = useAppTheme();
  return (
    <Text
      style={[
        styles.inlineCode,
        {
          backgroundColor: colors.background,
          borderRadius: 4,
          fontFamily: fonts.mono,
        },
      ]}>
      {children}
    </Text>
  );
}

function InstructionStep({ index, children }: { index: number; children: React.ReactNode }) {
  const { colors, typography, surfaceRadius, fonts } = useAppTheme();
  return (
    <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
      {index}. {children}
    </Text>
  );
}

export function WebIntegrationInstructions() {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.callout,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: surfaceRadius.card,
          padding: spacing.md,
          gap: spacing.xs,
        },
      ]}>
      <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
        {t('chatbot.integrations.web.instructions.title')}
      </Text>

      <InstructionStep index={1}>{t('chatbot.integrations.web.instructions.copy')}</InstructionStep>
      <InstructionStep index={2}>
        {t('chatbot.integrations.web.instructions.pasteBefore')} <InlineCode>{'</body>'}</InlineCode>{' '}
        {t('chatbot.integrations.web.instructions.pasteAfter')}
      </InstructionStep>
      <InstructionStep index={3}>
        {t('chatbot.integrations.web.instructions.replaceBefore')} <InlineCode>your-project-id-here</InlineCode>{' '}
        {t('chatbot.integrations.web.instructions.replaceAfter')}
      </InstructionStep>
      <InstructionStep index={4}>{t('chatbot.integrations.web.instructions.refresh')}</InstructionStep>
      <InstructionStep index={5}>{t('chatbot.integrations.web.instructions.appear')}</InstructionStep>

      <View
        style={[
          styles.noteDivider,
          {
            borderTopColor: colors.border,
            marginTop: spacing.sm,
            paddingTop: spacing.sm,
          },
        ]}>
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
          <Text style={typography.buttonLabel}>{t('chatbot.integrations.web.instructions.noteLabel')}</Text>{' '}
          {t('chatbot.integrations.web.instructions.noteBefore')} <InlineCode>/widget/v1/</InlineCode>{' '}
          {t('chatbot.integrations.web.instructions.noteAfter')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: { borderWidth: 1 },
  inlineCode: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  noteDivider: { borderTopWidth: 1 },
});
