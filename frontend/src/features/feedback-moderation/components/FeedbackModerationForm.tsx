import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { FeedbackModerationRecord } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { useFeedbackLayout } from '@/features/feedback-moderation/utils/feedback-layout';
import { AppButton } from '@/shared/components/app-button';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

type Props = {
  moderation: FeedbackModerationRecord | null;
  saving?: boolean;
  hideTitle?: boolean;
  onSave: (input: { internalNotes: string; reviewed: boolean; flagged: boolean; flagReason?: string }) => void;
};

export function FeedbackModerationForm({ moderation, saving, hideTitle = false, onSave }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { isNativeMobile } = useFeedbackLayout();
  const [notes, setNotes] = useState(moderation?.internal_notes ?? '');
  const [reviewed, setReviewed] = useState(moderation?.reviewed ?? false);
  const [flagged, setFlagged] = useState(moderation?.flagged ?? false);
  const [flagReason, setFlagReason] = useState(moderation?.flag_reason ?? '');

  useEffect(() => {
    setNotes(moderation?.internal_notes ?? '');
    setReviewed(moderation?.reviewed ?? false);
    setFlagged(moderation?.flagged ?? false);
    setFlagReason(moderation?.flag_reason ?? '');
  }, [moderation]);

  return (
    <View style={{ gap: spacing.md }}>
      {!hideTitle ? (
        <Text style={[typography.headingSemibold, { color: colors.text }]}>
          {t('feedbackModeration.moderation.updateTitle')}
        </Text>
      ) : null}
      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
          {t('feedbackModeration.moderation.notes')}
        </Text>
        <TextInput
          accessibilityLabel={t('feedbackModeration.moderation.notesA11y')}
          placeholder={t('feedbackModeration.moderation.notesPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={[
            getInputTextStyle(typography.body, { multiline: true, includeHorizontalPadding: false }),
            styles.notes,
            {
              color: colors.text,
              borderColor: colors.border,
              borderRadius: surfaceRadius.input,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.sm,
              paddingTop: 12,
              paddingBottom: 12,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.checkboxGroup,
          isNativeMobile ? styles.checkboxStack : styles.checkboxInline,
          { gap: spacing.md },
        ]}>
        <CheckboxRow
          label={t('feedbackModeration.moderation.markReviewed')}
          checked={reviewed}
          onToggle={() => setReviewed((v) => !v)}
        />
        <CheckboxRow
          label={t('feedbackModeration.moderation.flag')}
          checked={flagged}
          onToggle={() => setFlagged((v) => !v)}
        />
      </View>
      {flagged ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
            {t('feedbackModeration.moderation.flagReasonPlaceholder')}
          </Text>
          <TextInput
            accessibilityLabel={t('feedbackModeration.moderation.flagReasonPlaceholder')}
            placeholder={t('feedbackModeration.moderation.flagReasonInput')}
            placeholderTextColor={colors.textMuted}
            value={flagReason}
            onChangeText={setFlagReason}
            style={[
              getInputTextStyle(typography.body, { includeHorizontalPadding: false, height: 40 }),
              styles.flagReason,
              {
                color: colors.text,
                borderColor: colors.border,
                borderRadius: surfaceRadius.input,
                backgroundColor: colors.surface,
                paddingHorizontal: spacing.sm,
              },
            ]}
          />
        </View>
      ) : null}
      <AppButton
        label={t('feedbackModeration.moderation.save')}
        onPress={() =>
          onSave({
            internalNotes: notes,
            reviewed,
            flagged,
            flagReason: flagged ? flagReason : undefined,
          })
        }
        loading={saving}
        disabled={saving}
        fullWidth
      />
    </View>
  );
}

function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const { colors, typography } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.checkboxRow}>
      <AppCheckboxMark checked={checked} />
      <Text style={[typography.body, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notes: {
    minHeight: 96,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  flagReason: {
    minHeight: 40,
    borderWidth: 1,
  },
  checkboxGroup: {},
  checkboxStack: {
    flexDirection: 'column',
  },
  checkboxInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
