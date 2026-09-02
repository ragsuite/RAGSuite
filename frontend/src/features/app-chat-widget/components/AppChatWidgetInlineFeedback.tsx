import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Star, X } from 'lucide-react-native';

import type { AppChatWidgetFeedbackSentiment } from '@/features/app-chat-widget/utils/app-chat-widget-feedback-options';
import {
  APP_CHAT_WIDGET_MAX_FEEDBACK_COMMENT,
  APP_CHAT_WIDGET_NEGATIVE_REASONS,
  APP_CHAT_WIDGET_POSITIVE_REASONS,
} from '@/features/app-chat-widget/utils/app-chat-widget-feedback-options';
import type { AppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import type { FeedbackReasonKey } from '@/shared/constants/feedback-reason-keys';
import { createTranslatorForLanguage } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  sentiment: AppChatWidgetFeedbackSentiment;
  theme: AppChatWidgetTheme;
  /** Chatbot widget language (e.g. hi, de) — not the dashboard UI locale. */
  language?: string | null;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (payload: { rating: number; reasons: FeedbackReasonKey[]; comments: string }) => void;
};

export function AppChatWidgetInlineFeedback({
  sentiment,
  theme,
  language,
  submitting = false,
  onCancel,
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

  const reasonLabel = (reason: FeedbackReasonKey) => t(`chatbot.widget.feedback.reason.${reason}`);

  return (
    <View
      style={[
        styles.shell,
        {
          borderColor: theme.panelBorderColor,
          backgroundColor: theme.inputSectionBg,
          borderRadius: surfaceRadius.input,
        },
      ]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.heroTitleColor }]}>
          {sentiment === 'positive'
            ? t('chatbot.widget.feedback.positive')
            : t('chatbot.widget.feedback.negative')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chatbot.widget.feedback.cancel.a11y')}
          onPress={onCancel}
          hitSlop={8}>
          <X size={14} color={theme.metaColor} />
        </Pressable>
      </View>

      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((value) => {
          const filled = value <= rating;
          return (
            <Pressable key={value} accessibilityRole="button" onPress={() => setRating(value)} hitSlop={4}>
              <Star size={18} color={theme.starColor} fill={filled ? theme.starColor : 'none'} />
            </Pressable>
          );
        })}
        <Text style={[styles.ratingLabel, { color: theme.metaColor }]}>{rating}/5</Text>
      </View>

      <View style={styles.chipRow}>
        {reasons.map((reason) => {
          const active = selectedReasons.includes(reason);
          return (
            <Pressable
              key={reason}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => toggleReason(reason)}
              style={[
                styles.chip,
                {
                  borderColor: active ? theme.accentColor : theme.panelBorderColor,
                  backgroundColor: active ? theme.accentColor : theme.assistantBubbleBg,
                  borderRadius: surfaceRadius.button,
                },
              ]}>
              <Text
                style={[
                  styles.chipText,
                  { color: active ? theme.accentForegroundColor : theme.heroSubtitleColor },
                ]}>
                {reasonLabel(reason)}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
            backgroundColor: theme.assistantBubbleBg,
            borderRadius: surfaceRadius.input,
          },
          Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null,
        ]}
        textAlignVertical="top"
      />

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={onCancel}
          style={[styles.footerBtn, { borderColor: theme.panelBorderColor, borderRadius: surfaceRadius.button }]}>
          <Text style={{ color: theme.heroTitleColor, fontWeight: '500' }}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={submitting || rating < 1}
          onPress={() => onSubmit({ rating, reasons: selectedReasons, comments: comments.trim() })}
          style={[
            styles.footerBtn,
            styles.submitBtn,
            { backgroundColor: theme.accentColor, opacity: submitting ? 0.6 : 1, borderRadius: surfaceRadius.button },
          ]}>
          {submitting ? (
            <ActivityIndicator color={theme.accentForegroundColor} size="small" />
          ) : (
            <Text style={[styles.submitText, { color: theme.accentForegroundColor }]}>
              {t('chatbot.widget.feedback.submitCompact')}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    padding: 10,
    gap: 10,
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  comments: {
    borderWidth: 1,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
  },
  footerBtn: {
    flex: 1,
    minHeight: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    borderWidth: 0,
  },
  submitText: {
    fontWeight: '500',
    fontSize: 13,
  },
});
