import { Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackDetailSection } from '@/features/feedback-moderation/components/FeedbackDetailSection';
import { FeedbackModerationForm } from '@/features/feedback-moderation/components/FeedbackModerationForm';
import { FeedbackSavedModerationTimeline } from '@/features/feedback-moderation/components/FeedbackSavedModerationTimeline';
import {
  clearFeedbackModeration,
  saveFeedbackModeration,
} from '@/features/feedback-moderation/services/feedback-moderation.service';
import type {
  FeedbackDetail,
  SaveModerationInput,
} from '@/features/feedback-moderation/types/feedback-moderation.types';
import { hasSavedModeration } from '@/features/feedback-moderation/utils/feedback-display';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  detail: FeedbackDetail;
  onDetailChange?: (detail: FeedbackDetail) => void;
  notify: (message: string, type?: 'success' | 'error') => void;
};

export function FeedbackModerationSection({ detail, onDetailChange, notify }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { confirm } = useConfirm();
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const busy = saving || removing;
  const subtitleStyle = [typography.caption, { color: colors.text, fontWeight: '500' as const }];

  const onSaveModeration = async (input: SaveModerationInput) => {
    setSaving(true);
    try {
      const saved = await saveFeedbackModeration(detail.messageId, input);
      onDetailChange?.({ ...detail, moderation: saved, reviewed: saved.reviewed, flagged: saved.flagged });
      notify(t('feedbackModeration.toast.saved'));
    } catch {
      notify(t('feedbackModeration.toast.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onRemoveModeration = async () => {
    const confirmed = await confirm({
      title: t('feedbackModeration.moderation.removeConfirm.title'),
      message: t('feedbackModeration.moderation.removeConfirm.message'),
      confirmLabel: t('feedbackModeration.moderation.removeConfirm.confirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      variant: 'danger',
    });
    if (!confirmed) return;
    setRemoving(true);
    try {
      await clearFeedbackModeration(detail.messageId);
      onDetailChange?.({ ...detail, moderation: null, reviewed: false, flagged: false });
      notify(t('feedbackModeration.toast.removed'));
    } catch {
      notify(t('feedbackModeration.toast.removeFailed'), 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <FeedbackDetailSection title={t('feedbackModeration.detail.section.moderation')}>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <View style={[styles.headerRow, { gap: spacing.sm }]}>
            <Text style={[subtitleStyle, styles.headerLabel]}>{t('feedbackModeration.moderation.savedTitle')}</Text>
            {hasSavedModeration(detail.moderation) ? (
              <AppButton
                label={t('feedbackModeration.moderation.remove')}
                icon={Trash2}
                variant="outline"
                size="compact"
                onPress={() => void onRemoveModeration()}
                loading={removing}
                disabled={busy}
              />
            ) : null}
          </View>
          <FeedbackSavedModerationTimeline moderation={detail.moderation} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text style={subtitleStyle}>{t('feedbackModeration.moderation.updateTitle')}</Text>
          <FeedbackModerationForm
            moderation={detail.moderation}
            saving={saving}
            hideTitle
            onSave={(input) => void onSaveModeration(input)}
          />
        </View>
      </View>
    </FeedbackDetailSection>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLabel: {
    flex: 1,
    minWidth: 0,
  },
});
