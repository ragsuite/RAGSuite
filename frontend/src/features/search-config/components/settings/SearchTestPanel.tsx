import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { FlaskConical } from 'lucide-react-native';

import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import {
  DEFAULT_SEARCH_WIDGET_CUSTOMIZATION,
  SearchWidgetLiveSurface,
} from '@/features/search-config/components/settings/SearchWidgetLiveSurface';
import { SearchWidgetResultPane } from '@/features/search-config/components/settings/SearchWidgetResultPane';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { SearchTestFeedbackSentiment } from '@/features/search-config/utils/search-test-feedback-options';
import { SEARCH_TEST_MIN_QUERY_LENGTH } from '@/features/search-config/utils/search-test-feedback-options';
import { SEARCH_TEST_MAX_QUERY_LENGTH } from '@/features/search-config/utils/search-test-options';
import { resolveSearchSubmitQuery } from '@/features/search-config/utils/resolve-search-submit-query';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { copyText } from '@/shared/utils/copy-text';
import { getRenderablePlainText } from '@/shared/utils/html-content';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

function formatRecentTimestamp(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return t('search.test.time.justNow');
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return t('search.test.time.minutesAgoShort', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('search.test.time.hoursAgoShort', { count: hours });
  return t('search.test.time.earlier');
}

export function SearchTestPanel() {
  const { spacing } = useAppTheme();
  const { t } = useTranslation();
  const {
    bundle,
    testResult,
    testLoading,
    testStreamingAnswer,
    testStreamingSources,
    saving,
    notify,
    handleRunSearchTest,
    handleSubmitSearchTestFeedback,
  } = useSearchConfig();
  const [query, setQuery] = useState('');
  const [feedbackSentiment, setFeedbackSentiment] = useState<SearchTestFeedbackSentiment | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const blurHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurHideTimeoutRef.current) {
        clearTimeout(blurHideTimeoutRef.current);
        blurHideTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setFeedbackSentiment(null);
    setFeedbackSubmitted(false);
    setCopied(false);
  }, [testResult?.id]);

  const clearBlurHideTimeout = () => {
    if (blurHideTimeoutRef.current) {
      clearTimeout(blurHideTimeoutRef.current);
      blurHideTimeoutRef.current = null;
    }
  };

  const config = bundle?.searchBoxConfig;
  const customization = bundle?.searchBoxCustomization ?? DEFAULT_SEARCH_WIDGET_CUSTOMIZATION;
  const trimmed = query.trim();
  const showMinLengthError = trimmed.length > 0 && trimmed.length < SEARCH_TEST_MIN_QUERY_LENGTH;
  const showMaxLengthError = query.length > SEARCH_TEST_MAX_QUERY_LENGTH;
  const canSearch =
    trimmed.length >= SEARCH_TEST_MIN_QUERY_LENGTH &&
    trimmed.length <= SEARCH_TEST_MAX_QUERY_LENGTH &&
    !testLoading;
  const collectFeedback = bundle?.searchBoxConfig?.collectUserFeedback ?? true;

  const predefinedQuestions = useMemo(() => {
    const settings = bundle?.predefinedQuestions;
    if (!settings?.enabled) return [];
    return settings.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .slice(0, settings.questionLimit);
  }, [bundle?.predefinedQuestions]);

  const recentSearches = useMemo(() => {
    const seen = new Set<string>();
    const items: { id: string; text: string; timestamp: string }[] = [];
    for (const entry of bundle?.searchHistory ?? []) {
      const text = entry.user_message?.trim();
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      items.push({
        id: entry.id,
        text,
        timestamp: formatRecentTimestamp(entry.created_at, t),
      });
      if (items.length >= 5) break;
    }
    return items;
  }, [bundle?.searchHistory, t]);

  const runSearch = (override?: string) => {
    const next = resolveSearchSubmitQuery(override, query);
    if (
      next.length < SEARCH_TEST_MIN_QUERY_LENGTH ||
      next.length > SEARCH_TEST_MAX_QUERY_LENGTH ||
      testLoading
    ) {
      return;
    }
    clearBlurHideTimeout();
    setQuery(next);
    setFeedbackSentiment(null);
    setFeedbackSubmitted(false);
    setIsFocused(false);
    void handleRunSearchTest(next);
  };

  const selectRecent = (text: string) => {
    clearBlurHideTimeout();
    setQuery(text);
    setFeedbackSentiment(null);
    setFeedbackSubmitted(false);
    setIsFocused(false);
    if (text.trim().length >= SEARCH_TEST_MIN_QUERY_LENGTH) {
      void handleRunSearchTest(text.trim());
    }
  };

  const copyAnswer = async () => {
    if (!testResult?.answer) return;
    const ok = await copyText(getRenderablePlainText(testResult.answer));
    notify(ok ? t('search.test.copySuccess') : t('search.test.copyFailed'), ok ? 'success' : 'error');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const submitFeedback = async (payload: {
    rating: number;
    reasons: string[];
    comments: string;
  }) => {
    if (!testResult || !feedbackSentiment || feedbackSubmitted) return false;
    const ok = await handleSubmitSearchTestFeedback({
      sentiment: feedbackSentiment,
      rating: payload.rating,
      reasons: payload.reasons,
      comments: payload.comments,
      resultId: testResult.id,
    });
    if (ok) setFeedbackSubmitted(true);
    return ok;
  };

  return (
    <SearchConfigPanelCard
      icon={FlaskConical}
      title={t('search.test.title')}
      subtitle={t('search.test.subtitle')}
      style={{ overflow: 'visible' }}>
      <View style={{ gap: spacing.md, overflow: 'visible' }}>
        <SectionCard>
          <SearchWidgetLiveSurface
            config={config}
            customization={customization}
            predefinedQuestions={predefinedQuestions}
            recentSearches={recentSearches}
            query={query}
            onQueryChange={setQuery}
            onSubmit={runSearch}
            onSelectRecent={selectRecent}
            onSelectQuestion={(text) => {
              setQuery(text);
              setFeedbackSentiment(null);
              if (text.trim().length >= SEARCH_TEST_MIN_QUERY_LENGTH) {
                void handleRunSearchTest(text.trim());
              }
            }}
            isFocused={isFocused}
            onFocus={() => {
              clearBlurHideTimeout();
              setIsFocused(true);
            }}
            onBlur={() => {
              clearBlurHideTimeout();
              blurHideTimeoutRef.current = setTimeout(() => {
                setIsFocused(false);
                blurHideTimeoutRef.current = null;
              }, 150);
            }}
            canSearch={canSearch}
            showMinLengthError={showMinLengthError}
            showMaxLengthError={showMaxLengthError}
            loading={testLoading}
            streamingAnswer={testStreamingAnswer}
            streamingSources={testStreamingSources}
            result={testResult}
            topK={bundle?.modelSettings?.topKResults}
            collectFeedback={collectFeedback}
            copied={copied}
            onCopy={() => void copyAnswer()}
            feedbackSentiment={feedbackSentiment}
            feedbackLocked={feedbackSubmitted}
            feedbackSubmitting={saving}
            onFeedbackSentiment={setFeedbackSentiment}
            onCloseFeedback={() => setFeedbackSentiment(null)}
            onSubmitFeedback={submitFeedback}
            queryAccessibilityLabel="Search test query"
            includeResults={false}
          />
        </SectionCard>
        {testLoading || testResult || testStreamingAnswer ? (
          <SectionCard style={{ overflow: 'visible' }}>
            <SearchWidgetResultPane
              loaderType={config?.loader ?? 'skeleton'}
              showConfiguredLoader={testLoading && !testStreamingAnswer}
              streamingAnswer={testStreamingAnswer}
              streamingSources={testStreamingSources}
              loading={testLoading}
              result={testResult}
              topK={bundle?.modelSettings?.topKResults}
              collectFeedback={collectFeedback}
              language={config?.language}
              showSpeechOutput={customization.showSpeechOutput !== false}
              copied={copied}
              onCopy={() => void copyAnswer()}
              feedbackSentiment={feedbackSentiment}
              feedbackLocked={feedbackSubmitted}
              feedbackSubmitting={saving}
              onFeedbackSentiment={setFeedbackSentiment}
              onCloseFeedback={() => setFeedbackSentiment(null)}
              onSubmitFeedback={submitFeedback}
            />
          </SectionCard>
        ) : null}
      </View>
    </SearchConfigPanelCard>
  );
}
