import { GraduationCap } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { useFeedbackTraining } from '@/features/feedback-moderation/hooks/useFeedbackTraining';
import { formatFeedbackTimestamp } from '@/features/feedback-moderation/utils/feedback-display';
import {
  FEEDBACK_TRAINING_GUIDANCE_MAX,
  FEEDBACK_TRAINING_STATUS_KEYS,
  feedbackTrainingStatus,
} from '@/features/feedback-moderation/utils/feedback-training';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

type Props = {
  messageId: string;
  onNotify: (message: string, type?: 'success' | 'error') => void;
};

export function FeedbackTrainingCard({ messageId, onNotify }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { state, loading, loadFailed, pending, reload, train, untrain } = useFeedbackTraining(messageId);
  const [guidance, setGuidance] = useState('');

  useEffect(() => {
    setGuidance(state?.guidance ?? '');
  }, [state?.guidance, messageId]);

  const labelStyle = [typography.caption, { color: colors.text, fontWeight: '500' as const }];
  const mutedStyle = [typography.caption, { color: colors.textMuted, lineHeight: 18 }];

  if (loading && !state) {
    return (
      <View style={[styles.row, { gap: spacing.sm }]}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={mutedStyle}>{t('feedbackModeration.training.loading')}</Text>
      </View>
    );
  }

  if (loadFailed) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text style={labelStyle}>{t('feedbackModeration.training.title')}</Text>
        <Text style={[typography.caption, { color: colors.danger }]}>
          {t('feedbackModeration.training.loadFailed')}
        </Text>
        <AppButton label={t('feedbackModeration.training.retry')} variant="outline" onPress={() => void reload()} />
      </View>
    );
  }

  if (!state?.eligible) return null;

  const status = feedbackTrainingStatus(state);
  const busy = pending !== null;

  const onTrain = async () => {
    const ok = await train(guidance);
    onNotify(
      t(ok ? 'feedbackModeration.training.toast.trained' : 'feedbackModeration.training.toast.failed'),
      ok ? 'success' : 'error',
    );
  };

  const onUntrain = async () => {
    const ok = await untrain();
    onNotify(
      t(ok ? 'feedbackModeration.training.toast.removed' : 'feedbackModeration.training.toast.failed'),
      ok ? 'success' : 'error',
    );
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={labelStyle}>{t('feedbackModeration.training.title')}</Text>
      <View
        style={[
          styles.row,
          {
            gap: spacing.sm,
            padding: spacing.sm,
            borderColor: colors.border,
            borderRadius: surfaceRadius.button,
            backgroundColor: state.active ? colors.primaryTint : colors.surfaceMuted,
          },
          styles.bordered,
        ]}>
        <GraduationCap size={16} color={state.active ? colors.primary : colors.textMuted} />
        <View style={styles.flex}>
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
            {t(FEEDBACK_TRAINING_STATUS_KEYS[status])}
          </Text>
          {state.active && state.trainedAt ? (
            <Text style={mutedStyle}>
              {t('feedbackModeration.training.trainedOn', { date: formatFeedbackTimestamp(state.trainedAt) })}
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={mutedStyle}>{t('feedbackModeration.training.hint')}</Text>
      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
          {t('feedbackModeration.training.guidanceLabel')}
        </Text>
        <TextInput
          accessibilityLabel={t('feedbackModeration.training.guidanceLabel')}
          placeholder={t('feedbackModeration.training.guidancePlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={guidance}
          onChangeText={setGuidance}
          maxLength={FEEDBACK_TRAINING_GUIDANCE_MAX}
          editable={!busy}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={[
            getInputTextStyle(typography.body, { multiline: true, includeHorizontalPadding: false }),
            styles.guidance,
            {
              color: colors.text,
              borderColor: colors.border,
              borderRadius: surfaceRadius.input,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.sm,
            },
          ]}
        />
      </View>
      <View style={[styles.actions, { gap: spacing.sm }]}>
        <AppButton
          label={t(state.active ? 'feedbackModeration.training.update' : 'feedbackModeration.training.train')}
          onPress={() => void onTrain()}
          loading={pending === 'train'}
          disabled={busy}
        />
        {state.active ? (
          <AppButton
            label={t('feedbackModeration.training.remove')}
            variant="outline"
            onPress={() => void onUntrain()}
            loading={pending === 'untrain'}
            disabled={busy}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bordered: {
    borderWidth: 1,
  },
  flex: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  guidance: {
    minHeight: 72,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
