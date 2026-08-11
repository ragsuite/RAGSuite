import { Star, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppKeyboardAvoiding } from '@/shared/components/app-keyboard-avoiding';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import type { AppChatWidgetFeedbackSentiment } from '@/features/app-chat-widget/utils/app-chat-widget-feedback-options';
import {
    APP_CHAT_WIDGET_MAX_FEEDBACK_COMMENT,
    APP_CHAT_WIDGET_NEGATIVE_REASONS,
    APP_CHAT_WIDGET_POSITIVE_REASONS,
} from '@/features/app-chat-widget/utils/app-chat-widget-feedback-options';
import type { AppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import type { FeedbackReasonKey } from '@/shared/constants/feedback-reason-keys';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { createTranslatorForLanguage } from '@/i18n';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  sentiment: AppChatWidgetFeedbackSentiment;
  theme: AppChatWidgetTheme;
  /** Chatbot widget language (e.g. hi, de) — not the dashboard UI locale. */
  language?: string | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { rating: number; reasons: string[]; comments: string }) => void;
};

function StarRating({
  rating,
  onChange,
  metaColor,
  starColor,
  language,
}: {
  rating: number;
  onChange: (value: number) => void;
  metaColor: string;
  starColor: string;
  language?: string | null;
}) {
  const t = createTranslatorForLanguage(language);

  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = value <= rating;
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.feedback.rate.a11y', { value })}
            onPress={() => onChange(value)}
            hitSlop={6}
            style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1, padding: 2 }]}>
            <Star size={22} color={starColor} fill={filled ? starColor : 'none'} strokeWidth={1.5} />
          </Pressable>
        );
      })}
      <Text style={[styles.ratingLabel, { color: metaColor }]}>{rating}/5</Text>
    </View>
  );
}

export function AppChatWidgetFeedbackModal({
  sentiment,
  theme,
  language,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const t = createTranslatorForLanguage(language);
  const { surfaceRadius } = useAppTheme();
  const reasons =
    sentiment === 'positive' ? APP_CHAT_WIDGET_POSITIVE_REASONS : APP_CHAT_WIDGET_NEGATIVE_REASONS;
  const [rating, setRating] = useState(sentiment === 'positive' ? 5 : 1);
  const [selectedReasons, setSelectedReasons] = useState<FeedbackReasonKey[]>([]);
  const [comments, setComments] = useState('');

  useEffect(() => {
    setRating(sentiment === 'positive' ? 5 : 1);
    setSelectedReasons([]);
    setComments('');
  }, [sentiment]);

  const toggleReason = (reason: FeedbackReasonKey) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((item) => item !== reason) : [...prev, reason],
    );
  };

  const title =
    sentiment === 'positive'
      ? t('chatbot.widget.feedback.positiveEmoji')
      : t('chatbot.widget.feedback.negativeEmoji');

  const reasonLabel = (reason: FeedbackReasonKey) => t(`chatbot.widget.feedback.reason.${reason}`);

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Pressable
        accessibilityLabel={t('chatbot.widget.feedback.dismiss.a11y')}
        style={[styles.backdrop, { backgroundColor: overlayTokens.backdrop }]}
        onPress={onClose}
      />
      <AppKeyboardAvoiding surface="modal" style={styles.modalKeyboard}>
        <View
          style={[
            styles.modal,
            {
              backgroundColor: theme.assistantBubbleBg,
              borderColor: theme.panelBorderColor,
              borderRadius: surfaceRadius.modal,
            },
          ]}>
        <View style={[styles.header, { borderBottomColor: theme.panelBorderColor }]}>
          <Text style={[styles.title, { color: theme.heroTitleColor }]} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.feedback.close.a11y')}
            onPress={onClose}
            hitSlop={8}
            style={styles.closeBtn}>
            <X size={16} color={theme.metaColor} />
          </Pressable>
        </View>

        <AppScrollView
          scrollbarVariant="overlay"
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          automaticallyAdjustKeyboardInsets={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.heroTitleColor }]}>
              {t('chatbot.widget.feedback.rating')}{' '}
              <Text style={{ color: theme.errorAccent }}>*</Text>
            </Text>
            <StarRating
              rating={rating}
              onChange={setRating}
              metaColor={theme.metaColor}
              starColor={theme.starColor}
              language={language}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.heroTitleColor }]}>
              {t('chatbot.widget.feedback.reasonsOptional')}
            </Text>
            <View style={styles.chipRow}>
              {reasons.map((reason) => {
                const active = selectedReasons.includes(reason);
                return (
                  <Pressable
                    key={reason}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => toggleReason(reason)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: active ? theme.accentColor : theme.panelBorderColor,
                        backgroundColor: active ? `${theme.accentColor}22` : theme.inputSectionBg,
                        opacity: pressed ? 0.85 : 1,
                        borderRadius: surfaceRadius.button,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? theme.accentColor : theme.heroSubtitleColor },
                      ]}>
                      {reasonLabel(reason)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.heroTitleColor }]}>
              {t('chatbot.widget.feedback.commentsOptional')}
            </Text>
            <TextInput
              accessibilityLabel={t('chatbot.widget.feedback.comments.a11y')}
              multiline
              placeholder={t('chatbot.widget.feedback.commentsPlaceholder')}
              placeholderTextColor={theme.placeholderColor}
              value={comments}
              onChangeText={(text) => setComments(text.slice(0, APP_CHAT_WIDGET_MAX_FEEDBACK_COMMENT))}
              style={[
                styles.comments,
                {
                  color: theme.inputTextColor,
                  borderColor: theme.inputBorderColor,
                  backgroundColor: theme.inputSectionBg,
                  borderRadius: surfaceRadius.input,
                },
              ]}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: theme.metaColor }]}>
              {t('chatbot.widget.feedback.characters', {
                current: comments.length,
                max: APP_CHAT_WIDGET_MAX_FEEDBACK_COMMENT,
              })}
            </Text>
          </View>
        </AppScrollView>

        <View style={[styles.footer, { borderTopColor: theme.panelBorderColor, borderTopWidth: 1, paddingTop: 12 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.feedback.cancel.a11y')}
            disabled={submitting}
            onPress={onClose}
            style={({ pressed }) => [
              styles.footerBtn,
              {
                borderColor: theme.panelBorderColor,
                backgroundColor: pressed ? theme.inputSectionBg : 'transparent',
                opacity: submitting ? 0.6 : 1,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <Text style={[styles.footerBtnText, { color: theme.heroTitleColor }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.feedback.submit.a11y')}
            disabled={submitting || rating < 1}
            onPress={() => onSubmit({ rating, reasons: selectedReasons, comments: comments.trim() })}
            style={({ pressed }) => [
              styles.footerBtn,
              styles.submitBtn,
              {
                borderColor: theme.accentColor,
                backgroundColor: pressed ? theme.accentColor : theme.accentColor,
                opacity: submitting || rating < 1 ? 0.55 : 1,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            {submitting ? (
              <ActivityIndicator color={theme.accentForegroundColor} size="small" />
            ) : (
              <Text style={[styles.submitText, { color: theme.accentForegroundColor }]}>
                {t('chatbot.widget.feedback.submit')}
              </Text>
            )}
          </Pressable>
        </View>
        </View>
      </AppKeyboardAvoiding>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKeyboard: {
    width: '100%',
    maxWidth: 420,
    zIndex: 1,
  },
  modal: {
    width: '100%',
    maxHeight: '92%',
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginRight: 8,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 14,
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
  },
  ratingLabel: {
    fontWeight: '500',
    fontSize: 14,
    marginLeft: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  comments: {
    borderWidth: 1,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  footerBtn: {
    flex: 1,
    minHeight: TOUCH_TARGET_MIN,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  footerBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  submitBtn: {},
  submitText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
