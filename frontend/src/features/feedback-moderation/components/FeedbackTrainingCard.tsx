import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { FeedbackDetailSection } from '@/features/feedback-moderation/components/FeedbackDetailSection';
import { useFeedbackTraining } from '@/features/feedback-moderation/hooks/useFeedbackTraining';
import { formatFeedbackTimestamp } from '@/features/feedback-moderation/utils/feedback-display';
import {
  FEEDBACK_TRAINING_GUIDANCE_MAX,
  FEEDBACK_TRAINING_STATUS_KEYS,
  FEEDBACK_TRAINING_STATUS_TONES,
  feedbackTrainingStatus,
} from '@/features/feedback-moderation/utils/feedback-training';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { InfoHintButton } from '@/shared/components/info-hint-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

type Props = {
  messageId: string;
  onNotify: (message: string, type?: 'success' | 'error') => void;
};

export function FeedbackTrainingCard({ messageId, onNotify }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { confirm } = useConfirm();
  const { state, loading, loadFailed, pending, reload, train, untrain } = useFeedbackTraining(messageId);
  const [guidance, setGuidance] = useState('');

  useEffect(() => {
    setGuidance(state?.guidance ?? '');
  }, [state?.guidance, messageId]);

  const mutedStyle = [typography.caption, { color: colors.textMuted, lineHeight: 18 }];
  const title = t('feedbackModeration.training.title');
  const infoButton = (
    <InfoHintButton
      title={t('feedbackModeration.training.info.title')}
      body={t('feedbackModeration.training.hint')}
      accessibilityLabel={t('feedbackModeration.training.info.a11y')}
      iconSize={14}
      popoverWidth={280}
    />
  );

  if (loading && !state) {
    return (
      <FeedbackDetailSection title={title}>
        <View style={[styles.row, { gap: spacing.sm }]}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={mutedStyle}>{t('feedbackModeration.training.loading')}</Text>
        </View>
      </FeedbackDetailSection>
    );
  }

  if (loadFailed) {
    return (
      <FeedbackDetailSection title={title}>
        <View style={[styles.start, { gap: spacing.sm }]}>
          <Text style={[typography.caption, { color: colors.danger }]}>
            {t('feedbackModeration.training.loadFailed')}
          </Text>
          <AppButton
            label={t('feedbackModeration.training.retry')}
            variant="outline"
            size="compact"
            onPress={() => void reload()}
          />
        </View>
      </FeedbackDetailSection>
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
    const confirmed = await confirm({
      title: t('feedbackModeration.training.removeConfirm.title'),
      message: t('feedbackModeration.training.removeConfirm.message'),
      confirmLabel: t('feedbackModeration.training.removeConfirm.confirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      variant: 'danger',
    });
    if (!confirmed) return;
    const ok = await untrain();
    onNotify(
      t(ok ? 'feedbackModeration.training.toast.removed' : 'feedbackModeration.training.toast.failed'),
      ok ? 'success' : 'error',
    );
  };

  return (
    <FeedbackDetailSection
      title={title}
      titleAccessory={infoButton}
      titleRight={
        <StatusBadge
          label={t(FEEDBACK_TRAINING_STATUS_KEYS[status])}
          tone={FEEDBACK_TRAINING_STATUS_TONES[status]}
          size="compact"
          preserveCase
        />
      }>
      <View style={{ gap: spacing.sm }}>
        {state.active && state.trainedAt ? (
          <Text style={mutedStyle}>
            {t('feedbackModeration.training.trainedOn', { date: formatFeedbackTimestamp(state.trainedAt) })}
          </Text>
        ) : null}
        <View style={{ gap: spacing.xs }}>
          <View style={[styles.row, { gap: spacing.xxs }]}>
            <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
              {t('feedbackModeration.training.guidanceLabel')}
            </Text>
            <InfoHintButton
              title={t('feedbackModeration.training.guidanceInfo.title')}
              body={t('feedbackModeration.training.guidanceInfo.body')}
              accessibilityLabel={t('feedbackModeration.training.guidanceInfo.a11y')}
              iconSize={14}
              popoverWidth={280}
            />
          </View>
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
    </FeedbackDetailSection>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  start: {
    alignItems: 'flex-start',
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
