import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useAppSearchWidget } from '@/features/app-search-widget/providers/app-search-widget-provider';
import {
  canPaintSearchEmbed,
  resolveSearchEmbedHiddenReason,
} from '@/features/app-search-widget/utils/embed-iframe-visibility';
import {
  clampSearchEmbedContentHeight,
  measureSearchEmbedHostHeight,
  measureSearchEmbedOverlayExtension,
  SEARCH_EMBED_DEFAULT_HEIGHT,
} from '@/features/app-search-widget/utils/search-embed-content-height';
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
const RESIZE_DEBOUNCE_MS = 50;

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

function postEmbedResize(height: number, overlay: number) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage(
    {
      source: EMBED_MESSAGE_SOURCE,
      type: 'resize',
      height: clampSearchEmbedContentHeight(height),
      overlay: overlay > 0 ? Math.ceil(overlay) : 0,
      width: '100%',
    },
    '*',
  );
}

function postEmbedHidden(reason: 'inactive' | 'error' | 'unauthorized-origin') {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ source: EMBED_MESSAGE_SOURCE, type: 'hidden', reason }, '*');
}

function postEmbedFocusAck() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ source: EMBED_MESSAGE_SOURCE, type: 'focus-ack' }, '*');
}

/**
 * Third-party search embed host — same live search UI as Search Test (copy / thumbs / feedback).
 */
export function AppSearchWidgetEmbedHost() {
  const { t } = useTranslation();
  const {
    settings,
    settingsLoading,
    settingsLoadFailed,
    searchActive,
    result,
    loading,
    streamingAnswer,
    recentSearches,
    runSearch,
    submitFeedback,
    effectiveLanguage,
    setVisitorLanguage,
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
  const lastPostedRef = useRef({ height: 0, overlay: 0 });
  const overlayPxRef = useRef(0);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (blurHideTimeoutRef.current) clearTimeout(blurHideTimeoutRef.current);
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
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
      postEmbedFocusAck();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    setFeedbackSentiment(null);
    setFeedbackSubmitted(false);
    setCopied(false);
  }, [result?.id]);

  const reportHeight = useCallback((rawHeight: number, immediate = false) => {
    const height = clampSearchEmbedContentHeight(
      rawHeight > 0 ? rawHeight : SEARCH_EMBED_DEFAULT_HEIGHT,
    );

    const publish = () => {
      const overlay = overlayPxRef.current;
      if (
        height === lastPostedRef.current.height &&
        overlay === lastPostedRef.current.overlay &&
        !immediate
      ) {
        return;
      }
      lastPostedRef.current = { height, overlay };
      postEmbedResize(height, overlay);
    };

    if (immediate) {
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
      publish();
      return;
    }

    if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
    resizeDebounceRef.current = setTimeout(() => {
      resizeDebounceRef.current = null;
      publish();
    }, RESIZE_DEBOUNCE_MS);
  }, []);

  const measureAndReport = useCallback(
    (immediate = false) => {
      if (Platform.OS !== 'web') return;
      const node = hostRef.current as unknown as HTMLElement | null;
      const measured = measureSearchEmbedHostHeight(node);
      if (typeof document !== 'undefined') {
        const menu = document.querySelector('[data-embed-overlay="menu"]');
        if (menu instanceof HTMLElement && node) {
          overlayPxRef.current = measureSearchEmbedOverlayExtension(
            menu.getBoundingClientRect().bottom,
            node.getBoundingClientRect().bottom,
          );
        } else if (!languageMenuOpen) {
          overlayPxRef.current = 0;
        }
      }
      reportHeight(measured > 0 ? measured : SEARCH_EMBED_DEFAULT_HEIGHT, immediate);
    },
    [languageMenuOpen, reportHeight],
  );

  const paint = { settingsLoading, searchActive, config: settings?.config, customization: settings?.customization };
  const canPaint = canPaintSearchEmbed(paint);

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

  const contentFingerprint = useMemo(
    () =>
      [
        isFocused ? '1' : '0',
        loading ? '1' : '0',
        streamingAnswer?.length ?? 0,
        result?.id ?? '',
        result?.answer?.length ?? 0,
        predefinedQuestions.length,
        recentItems.length,
        query.length,
        feedbackSentiment ?? '',
      ].join(':'),
    [
      isFocused,
      loading,
      streamingAnswer,
      result?.id,
      result?.answer,
      predefinedQuestions.length,
      recentItems.length,
      query.length,
      feedbackSentiment,
    ],
  );

  useEffect(() => {
    const reason = resolveSearchEmbedHiddenReason({
      settingsLoading,
      settingsLoadFailed,
      searchActive,
      hasSettings: settings != null,
      canPaint: canPaintSearchEmbed(paint),
    });
    if (reason) postEmbedHidden(reason);
  }, [
    settingsLoading,
    settingsLoadFailed,
    searchActive,
    settings,
    paint.config,
    paint.customization,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !canPaint) return;
    measureAndReport(true);
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => measureAndReport(true))
        : null;
    return () => {
      if (raf != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    };
  }, [canPaint, measureAndReport, contentFingerprint, languageMenuOpen]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof ResizeObserver === 'undefined' || !canPaint) return;
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      measureAndReport(false);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [canPaint, measureAndReport, settingsLoading, searchActive, settings]);

  const trimmed = query.trim();
  const showMinLengthError = trimmed.length > 0 && trimmed.length < SEARCH_TEST_MIN_QUERY_LENGTH;
  const showMaxLengthError = query.length > SEARCH_TEST_MAX_QUERY_LENGTH;
  const canSearch =
    trimmed.length >= SEARCH_TEST_MIN_QUERY_LENGTH &&
    trimmed.length <= SEARCH_TEST_MAX_QUERY_LENGTH &&
    !loading;

  const run = (text: string) => {
    const next = text.trim();
    if (next.length < SEARCH_TEST_MIN_QUERY_LENGTH) return;
    setIsFocused(false);
    void runSearch(next);
  };

  if (!canPaint) return null;

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
        uiLanguage={effectiveLanguage}
        showLanguagePicker
        onLanguageChange={setVisitorLanguage}
        onLanguageMenuOpenChange={setLanguageMenuOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? ({ alignSelf: 'flex-start', flexGrow: 0, height: 'auto' } as object)
      : null),
  },
});
