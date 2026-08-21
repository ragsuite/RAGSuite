import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useAppSearchWidget } from '@/features/app-search-widget/providers/app-search-widget-provider';
import { canPaintSearchEmbed } from '@/features/app-search-widget/utils/embed-iframe-visibility';
import { isSearchEmbedFocusMessage } from '@/features/app-search-widget/utils/search-embed-focus-message';
import {
  SearchWidgetLiveSurface,
  type SearchWidgetLiveSurfaceHandle,
} from '@/features/search-config/components/settings/SearchWidgetLiveSurface';
import type { SearchTestFeedbackSentiment } from '@/features/search-config/utils/search-test-feedback-options';
import { SEARCH_TEST_MIN_QUERY_LENGTH } from '@/features/search-config/utils/search-test-feedback-options';
import { SEARCH_TEST_MAX_QUERY_LENGTH } from '@/features/search-config/utils/search-test-options';
import { resolveSearchSubmitQuery } from '@/features/search-config/utils/resolve-search-submit-query';
import { copyText } from '@/shared/utils/copy-text';
import { getRenderablePlainText } from '@/shared/utils/html-content';
import { useTranslation } from '@/i18n';

const EMBED_MESSAGE_SOURCE = 'ragsuite-search-embed';

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

function postEmbedResize(height: number) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage(
    {
      source: EMBED_MESSAGE_SOURCE,
      type: 'resize',
      height: Math.max(72, Math.ceil(height)),
      width: '100%',
    },
    '*',
  );
}

function postEmbedHidden(reason: 'inactive' | 'error') {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ source: EMBED_MESSAGE_SOURCE, type: 'hidden', reason }, '*');
}

/**
 * Third-party search embed host — same live search UI as Search Test (copy / thumbs / feedback).
 */
export function AppSearchWidgetEmbedHost() {
  const { t } = useTranslation();
  const {
    settings,
    settingsLoading,
    searchActive,
    result,
    loading,
    streamingAnswer,
    recentSearches,
    runSearch,
    submitFeedback,
  } = useAppSearchWidget();
  const [query, setQuery] = useState('');
  const [feedbackSentiment, setFeedbackSentiment] = useState<SearchTestFeedbackSentiment | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const blurHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostRef = useRef<View>(null);
  const surfaceRef = useRef<SearchWidgetLiveSurfaceHandle>(null);

  useEffect(() => {
    return () => {
      if (blurHideTimeoutRef.current) clearTimeout(blurHideTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (!isSearchEmbedFocusMessage(event.data)) return;
      if (blurHideTimeoutRef.current) clearTimeout(blurHideTimeoutRef.current);
      setIsFocused(true);
      surfaceRef.current?.focus();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    setFeedbackSentiment(null);
    setFeedbackSubmitted(false);
    setCopied(false);
  }, [result?.id]);

  const reportHeight = useCallback((height: number) => {
    if (height > 0) postEmbedResize(height);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof ResizeObserver === 'undefined') return;
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) reportHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [reportHeight, settingsLoading, searchActive, settings]);

  const paint = { settingsLoading, searchActive, config: settings?.config, customization: settings?.customization };

  useEffect(() => {
    if (settingsLoading) return;
    if (!canPaintSearchEmbed(paint)) {
      postEmbedHidden(searchActive === false ? 'inactive' : 'error');
    }
  }, [settingsLoading, searchActive, paint.config, paint.customization]);
  const trimmed = query.trim();
  const showMinLengthError = trimmed.length > 0 && trimmed.length < SEARCH_TEST_MIN_QUERY_LENGTH;
  const showMaxLengthError = query.length > SEARCH_TEST_MAX_QUERY_LENGTH;
  const canSearch =
    trimmed.length >= SEARCH_TEST_MIN_QUERY_LENGTH &&
    trimmed.length <= SEARCH_TEST_MAX_QUERY_LENGTH &&
    !loading;

  const predefinedQuestions = useMemo(() => {
    const predefined = settings?.predefinedQuestions;
    if (!predefined?.enabled) return [];
    return predefined.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .slice(0, predefined.questionLimit);
  }, [settings?.predefinedQuestions]);

  const recentItems = useMemo(
    () =>
      recentSearches.map((item, index) => ({
        id: `${item.at}_${index}`,
        text: item.text,
        timestamp: formatRecentTimestamp(item.at, t),
      })),
    [recentSearches, t],
  );

  const run = (text: string) => {
    const next = text.trim();
    if (next.length < SEARCH_TEST_MIN_QUERY_LENGTH) return;
    setIsFocused(false);
    void runSearch(next);
  };

  if (!canPaintSearchEmbed(paint)) return null;

  return (
    <View
      ref={hostRef}
      style={styles.host}
      onLayout={(event) => reportHeight(event.nativeEvent.layout.height)}>
      <SearchWidgetLiveSurface
        ref={surfaceRef}
        config={paint.config}
        customization={paint.customization}
        predefinedQuestions={predefinedQuestions}
        recentSearches={recentItems}
        query={query}
        onQueryChange={setQuery}
        onSubmit={(override) => run(resolveSearchSubmitQuery(override, query))}
        onSelectRecent={(text) => {
          setQuery(text);
          run(text);
        }}
        onSelectQuestion={(text) => {
          setQuery(text);
          run(text);
        }}
        isFocused={isFocused}
        onFocus={() => {
          if (blurHideTimeoutRef.current) clearTimeout(blurHideTimeoutRef.current);
          setIsFocused(true);
        }}
        onBlur={() => {
          if (blurHideTimeoutRef.current) clearTimeout(blurHideTimeoutRef.current);
          blurHideTimeoutRef.current = setTimeout(() => {
            setIsFocused(false);
            blurHideTimeoutRef.current = null;
          }, 150);
        }}
        canSearch={canSearch}
        showMinLengthError={showMinLengthError}
        showMaxLengthError={showMaxLengthError}
        loading={loading}
        streamingAnswer={streamingAnswer}
        result={result}
        topK={settings?.topKResults}
        collectFeedback={settings?.collectFeedback ?? true}
        copied={copied}
        onCopy={() => {
          if (!result?.answer) return;
          void copyText(getRenderablePlainText(result.answer)).then((ok) => {
            if (!ok) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        feedbackSentiment={feedbackSentiment}
        feedbackLocked={feedbackSubmitted}
        feedbackSubmitting={feedbackSubmitting}
        onFeedbackSentiment={setFeedbackSentiment}
        onCloseFeedback={() => setFeedbackSentiment(null)}
        onSubmitFeedback={async (payload) => {
          if (!result || !feedbackSentiment || feedbackSubmitted) return false;
          setFeedbackSubmitting(true);
          const ok = await submitFeedback({
            ...payload,
            sentiment: feedbackSentiment,
            resultId: result.id,
          });
          setFeedbackSubmitting(false);
          if (ok) setFeedbackSubmitted(true);
          return ok;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});
