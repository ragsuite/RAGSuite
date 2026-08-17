import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react-native';

import { SearchBoxLoaderPreview } from '@/features/search-config/components/SearchBoxLoaderPreview';
import { SearchTestFeedbackForm } from '@/features/search-config/components/settings/SearchTestFeedbackForm';
import { SearchTestSourcesList } from '@/features/search-config/components/settings/SearchTestSourcesList';
import { SearchWidgetActionButton } from '@/features/search-config/components/settings/SearchWidgetActionButton';
import type { SearchBoxLoader, SearchTestResult } from '@/features/search-config/types/search-config.types';
import type { SearchTestFeedbackSentiment } from '@/features/search-config/utils/search-test-feedback-options';
import { AppHtmlBody } from '@/shared/components/app-html-body';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const IS_WEB = Platform.OS === 'web';

export type SearchWidgetResultPaneProps = {
  loaderType: SearchBoxLoader;
  showConfiguredLoader: boolean;
  streamingAnswer: string | null;
  loading: boolean;
  result: SearchTestResult | null;
  topK?: number;
  collectFeedback: boolean;
  language?: string | null;
  copied: boolean;
  onCopy: () => void;
  feedbackSentiment: SearchTestFeedbackSentiment | null;
  feedbackLocked: boolean;
  feedbackSubmitting: boolean;
  onFeedbackSentiment: (sentiment: SearchTestFeedbackSentiment) => void;
  onCloseFeedback: () => void;
  onSubmitFeedback: (payload: {
    rating: number;
    reasons: string[];
    comments: string;
  }) => Promise<boolean>;
  showLatency?: boolean;
};

export function SearchWidgetResultPane({
  loaderType,
  showConfiguredLoader,
  streamingAnswer,
  loading,
  result,
  topK,
  collectFeedback,
  language,
  copied,
  onCopy,
  feedbackSentiment,
  feedbackLocked,
  feedbackSubmitting,
  onFeedbackSentiment,
  onCloseFeedback,
  onSubmitFeedback,
  showLatency = true,
}: SearchWidgetResultPaneProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();

  if (showConfiguredLoader) {
    return <SearchBoxLoaderPreview loader={loaderType} />;
  }

  if (loading && streamingAnswer) {
    return <AppHtmlBody html={streamingAnswer} />;
  }

  if (!result) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <AppHtmlBody html={result.answer} />

      {showLatency && result.latencyMs > 0 ? (
        <Text style={[typography.caption, typography.numeric, { color: colors.textMuted }]}>
          Response time: {result.latencyMs}ms
        </Text>
      ) : null}

      <SearchTestSourcesList citations={result.citations} topK={topK} />

      <View style={[styles.actions, { gap: spacing.sm }]}>
        <SearchWidgetActionButton
          label={t('chatbot.widget.app.copyResponse.a11y')}
          tooltipAlign="start"
          onPress={onCopy}>
          {(iconColor) =>
            copied ? (
              <Check size={16} color={colors.ochre} strokeWidth={2} />
            ) : (
              <ActionIcons.copy size={16} color={iconColor} strokeWidth={2} />
            )
          }
        </SearchWidgetActionButton>
        {collectFeedback ? (
          <>
            <SearchWidgetActionButton
              label={t('chatbot.widget.app.thumbsUp.a11y')}
              selected={feedbackSentiment === 'positive'}
              disabled={feedbackLocked}
              onPress={() => {
                if (feedbackLocked) return;
                onFeedbackSentiment('positive');
              }}>
              {(iconColor) => (
                <ThumbsUp
                  size={16}
                  color={iconColor}
                  strokeWidth={2}
                  fill={feedbackSentiment === 'positive' ? iconColor : 'none'}
                />
              )}
            </SearchWidgetActionButton>
            <SearchWidgetActionButton
              label={t('chatbot.widget.app.thumbsDown.a11y')}
              selected={feedbackSentiment === 'negative'}
              disabled={feedbackLocked}
              onPress={() => {
                if (feedbackLocked) return;
                onFeedbackSentiment('negative');
              }}>
              {(iconColor) => (
                <ThumbsDown
                  size={16}
                  color={iconColor}
                  strokeWidth={2}
                  fill={feedbackSentiment === 'negative' ? iconColor : 'none'}
                />
              )}
            </SearchWidgetActionButton>
          </>
        ) : null}
      </View>

      {collectFeedback && feedbackSentiment && !feedbackLocked ? (
        <SearchTestFeedbackForm
          sentiment={feedbackSentiment}
          language={language}
          submitting={feedbackSubmitting}
          onClose={onCloseFeedback}
          onSubmit={onSubmitFeedback}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    ...(IS_WEB ? ({ overflow: 'visible' as const, zIndex: 1 } as object) : null),
  },
});
