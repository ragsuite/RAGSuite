import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { QaPairDraft } from '@/features/crawl/types/textual-source.types';
import { TEXTUAL_SOURCE_LIMITS } from '@/features/crawl/utils/textual-sources';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  pair: QaPairDraft;
  index: number;
  canRemove: boolean;
  disabled: boolean;
  onChange: (id: string, patch: Partial<Pick<QaPairDraft, 'question' | 'answer'>>) => void;
  onRemove: (id: string) => void;
};

export function QaPairCard({ pair, index, canRemove, disabled, onChange, onRemove }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const order = index + 1;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: surfaceRadius.card,
          padding: spacing.sm,
          gap: spacing.xs,
        },
      ]}>
      <View style={styles.header}>
        <Text style={[typography.caption, styles.title, { color: colors.text }]}>
          {t('crawl.qa.pair.title', { order })}
        </Text>
        <AppButton
          label={t('crawl.qa.pair.remove')}
          accessibilityLabel={t('crawl.qa.pair.removeA11y', { order })}
          icon={ActionIcons.delete}
          variant="ghost"
          size="dense"
          disabled={disabled || !canRemove}
          onPress={() => onRemove(pair.id)}
        />
      </View>
      <AppTextField
        label={t('crawl.qa.pair.question')}
        value={pair.question}
        onChangeText={(question) => onChange(pair.id, { question })}
        placeholder={t('crawl.qa.pair.questionPlaceholder')}
        maxLength={TEXTUAL_SOURCE_LIMITS.question}
        editable={!disabled}
      />
      <AppTextField
        label={t('crawl.qa.pair.answer')}
        value={pair.answer}
        onChangeText={(answer) => onChange(pair.id, { answer })}
        placeholder={t('crawl.qa.pair.answerPlaceholder')}
        maxLength={TEXTUAL_SOURCE_LIMITS.answer}
        multiline
        numberOfLines={4}
        editable={!disabled}
        style={styles.answer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontWeight: '600' },
  answer: { minHeight: 96, textAlignVertical: 'top' },
});
