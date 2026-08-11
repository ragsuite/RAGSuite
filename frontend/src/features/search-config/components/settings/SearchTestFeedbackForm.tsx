import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckCircle2, Star, ThumbsDown, ThumbsUp, X } from 'lucide-react-native';

import type { SearchTestFeedbackSentiment } from '@/features/search-config/utils/search-test-feedback-options';
import {
  SEARCH_TEST_MAX_FEEDBACK_COMMENT,
  SEARCH_TEST_NEGATIVE_REASONS,
  SEARCH_TEST_POSITIVE_REASONS,
} from '@/features/search-config/utils/search-test-feedback-options';
import { createTranslatorForLanguage } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  sentiment: SearchTestFeedbackSentiment;
  /** Search box language (e.g. hi, de, en-us) — not the dashboard UI locale. */
  language?: string | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { rating: number; reasons: string[]; comments: string }) => Promise<boolean>;
};

function StarRating({
  rating,
  onChange,
  disabled,
  language,
}: {
  rating: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  language?: string | null;
}) {
  const t = createTranslatorForLanguage(language);
  const { colors } = useAppTheme();

  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = value <= rating;
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={t('search.test.feedback.rate.a11y', { value })}
            disabled={disabled}
            onPress={() => onChange(value)}
            hitSlop={6}
            style={({ pressed }) => [{ opacity: pressed || disabled ? 0.75 : 1, padding: 2 }]}>
            <Star
              size={22}
              color={colors.ochre}
              fill={filled ? colors.ochre : 'none'}
              strokeWidth={1.5}
            />
          </Pressable>
        );
      })}
      <Text style={{ color: colors.textMuted, fontSize: 14, marginLeft: 4 }}>
        {rating}/5
      </Text>
    </View>
  );
}

export function SearchTestFeedbackForm({
  sentiment,
  language,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const t = createTranslatorForLanguage(language);
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const controlRadius = surfaceRadius.button;
  const inputRadius = surfaceRadius.input;
  const HeaderIcon = sentiment === 'positive' ? ThumbsUp : ThumbsDown;
  const reasons =
    sentiment === 'positive' ? SEARCH_TEST_POSITIVE_REASONS : SEARCH_TEST_NEGATIVE_REASONS;
  const [rating, setRating] = useState(sentiment === 'positive' ? 5 : 1);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);

  useEffect(() => {
    setRating(sentiment === 'positive' ? 5 : 1);
    setSelectedReasons([]);
    setComments('');
    setSubmitted(false);
    setLocalSubmitting(false);
  }, [sentiment]);

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    );
  };

  const title =
    sentiment === 'positive' ? t('search.test.feedback.positive') : t('search.test.feedback.negative');
  const busy = submitting || localSubmitting;
  const reasonLabel = (reason: string) => {
    const key = `search.test.feedback.reason.${reason}`;
    const translated = t(key);
    return translated === key ? reason : translated;
  };

  const handleSubmit = async () => {
    if (busy || rating < 1) return;
    setLocalSubmitting(true);
    try {
      const ok = await onSubmit({ rating, reasons: selectedReasons, comments: comments.trim() });
      if (ok) {
        setSubmitted(true);
        setTimeout(() => onClose(), 2500);
      }
    } finally {
      setLocalSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View
        style={[
          styles.successBox,
          {
            borderColor: colors.border,
            borderRadius: panelRadius,
            backgroundColor: colors.surface,
            padding: spacing.md,
            marginTop: spacing.sm,
            gap: spacing.sm,
          },
        ]}>
        <CheckCircle2 size={20} color={colors.success} />
        <Text style={[typography.body, { color: colors.success, fontWeight: '500', flex: 1 }]}>
          {t('search.test.feedback.submitted')}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.form,
        {
          borderColor: colors.border,
          borderRadius: panelRadius,
          backgroundColor: colors.surface,
          padding: spacing.md,
          gap: spacing.md,
          marginTop: spacing.sm,
        },
      ]}>
      <View style={styles.formHeader}>
        <View style={[styles.formTitleRow, { gap: spacing.xs, flex: 1 }]}>
          <HeaderIcon size={18} color={colors.text} strokeWidth={2} />
          <Text style={[typography.subtitle, { color: colors.text, flex: 1 }]}>
            {title}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('search.test.feedback.close.a11y')}
          onPress={onClose}
          disabled={busy}
          hitSlop={8}
          style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1, padding: 4 }]}>
          <X size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
          {t('search.test.feedback.rating')} <Text style={{ color: colors.danger }}>*</Text>
        </Text>
        <StarRating rating={rating} onChange={setRating} disabled={busy} language={language} />
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
          {t('search.test.feedback.reasonsOptional')}
        </Text>
        <View style={[styles.chipRow, { gap: spacing.xs }]}>
          {reasons.map((reason) => {
            const active = selectedReasons.includes(reason);
            return (
              <Pressable
                key={reason}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                disabled={busy}
                onPress={() => toggleReason(reason)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    borderRadius: surfaceRadius.button,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : colors.surfaceMuted,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}>
                <Text
                  style={[
                    typography.caption,
                    {
                      color: active ? colors.textOnPrimary : colors.text,
                      fontWeight: active ? '500' : '400',
                    },
                  ]}>
                  {reasonLabel(reason)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
          {t('search.test.feedback.commentsOptional')}
        </Text>
        <TextInput
          accessibilityLabel={t('search.test.feedback.comments.a11y')}
          multiline
          editable={!busy}
          placeholder={t('search.test.feedback.commentsPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={comments}
          onChangeText={(text) => setComments(text.slice(0, SEARCH_TEST_MAX_FEEDBACK_COMMENT))}
          style={[
            typography.body,
            styles.comments,
            {
              color: colors.text,
              borderColor: colors.border,
              borderRadius: inputRadius,
              backgroundColor: colors.surface,
            },
          ]}
          textAlignVertical="top"
        />
        <Text style={[typography.caption, styles.charCount, { color: colors.textMuted }]}>
          {t('search.test.feedback.characters', {
            current: comments.length,
            max: SEARCH_TEST_MAX_FEEDBACK_COMMENT,
          })}
        </Text>
      </View>

      <View style={[styles.footer, { gap: spacing.sm }]}>
        <AppButton
          variant="outline"
          size="compact"
          label={t('common.cancel')}
          onPress={onClose}
          disabled={busy}
        />
        <AppButton
          variant="cta"
          size="compact"
          label={t('search.test.feedback.submit')}
          onPress={() => void handleSubmit()}
          disabled={busy || rating < 1}
          loading={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { borderWidth: 1, width: '100%' },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formTitleRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  starRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  comments: {
    borderWidth: 1,
    minHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  charCount: { alignSelf: 'flex-end' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: '100%' },
  successBox: {
    borderWidth: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
});
