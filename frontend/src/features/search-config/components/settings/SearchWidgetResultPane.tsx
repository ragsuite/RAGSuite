import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Check, ChevronDown, ChevronUp, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react-native';

import { SearchBoxLoaderPreview } from '@/features/search-config/components/SearchBoxLoaderPreview';
import { GoogleSourceCard } from '@/features/search-config/components/settings/GoogleSourceCard';
import { SearchTestFeedbackForm } from '@/features/search-config/components/settings/SearchTestFeedbackForm';
import { SearchWidgetActionButton } from '@/features/search-config/components/settings/SearchWidgetActionButton';
import type { SearchBoxLoader, SearchTestCitation, SearchTestResult } from '@/features/search-config/types/search-config.types';
import { pickUniqueSourcePreviewImages } from '@/features/search-config/utils/source-preview-images';
import type { SearchTestFeedbackSentiment } from '@/features/search-config/utils/search-test-feedback-options';
import { AppHtmlBody } from '@/shared/components/app-html-body';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ExtensionSlot } from '@/platform/extension-slots';
import { webSticky } from '@/shared/utils/web-sticky';

const IS_WEB = Platform.OS === 'web';
const SIDEBAR_WIDTH = 280;
const COLLAPSE_BREAKPOINT = 640;
/** Collapsed palette shows this many cards before Show All. */
const COLLAPSED_SOURCE_COUNT = 3;
/** Expanded palette viewport height ≈ this many cards before inner scroll. */
const EXPANDED_VISIBLE_SOURCE_COUNT = 5;
/** Approximate GoogleSourceCard row height (thumb + padding + gap). */
const SOURCE_CARD_ROW_HEIGHT = 72;
const EXPANDED_LIST_MAX_HEIGHT = EXPANDED_VISIBLE_SOURCE_COUNT * SOURCE_CARD_ROW_HEIGHT;
/** Reserve space so Show All scrollbar never shifts titles / OG thumbs. Matches thin overlay thumb. */
const SOURCE_SCROLLBAR_GUTTER = 10;

export type SearchWidgetResultPaneProps = {
  loaderType: SearchBoxLoader;
  showConfiguredLoader: boolean;
  streamingAnswer: string | null;
  streamingSources?: SearchTestCitation[];
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
};

export function SearchWidgetResultPane({
  loaderType,
  showConfiguredLoader,
  streamingAnswer,
  streamingSources,
  loading,
  result,
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
}: SearchWidgetResultPaneProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [showAllSources, setShowAllSources] = useState(false);

  const isStreaming = loading && Boolean(streamingAnswer);
  const answerHtml = (
    isStreaming
      ? streamingAnswer
      : result?.answer?.trim()
        ? result.answer
        : streamingAnswer?.trim()
          ? streamingAnswer
          : result?.answer
  ) ?? null;
  const citations =
    result?.citations && result.citations.length > 0
      ? result.citations
      : streamingSources ?? result?.citations ?? [];
  const hasSources = citations.length > 0;
  const badgeImages = useMemo(() => pickUniqueSourcePreviewImages(citations, 3), [citations]);

  if (showConfiguredLoader) {
    return <SearchBoxLoaderPreview loader={loaderType} />;
  }

  if (!answerHtml && !isStreaming) {
    if (!result) return null;
    return (
      <View
        style={[
          styles.resultCard,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing.md,
            borderRadius: 16,
          },
        ]}>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          No answer was returned for this query. Try again.
        </Text>
      </View>
    );
  }

  const isWide = windowWidth >= COLLAPSE_BREAKPOINT;
  const collapsedSources = citations.slice(0, COLLAPSED_SOURCE_COUNT);
  const hasMoreSources = citations.length > COLLAPSED_SOURCE_COUNT;

  const sourceCards = (sources: SearchTestCitation[]) =>
    sources.map((source, index) => (
      <GoogleSourceCard key={`${source.id}_${index}`} source={source} />
    ));

  const sourceSidebar = hasSources ? (
    <View
      style={[
        styles.sidebar,
        isWide
          ? {
              width: SIDEBAR_WIDTH,
              borderLeftWidth: 1,
              borderLeftColor: colors.border,
              paddingLeft: spacing.md,
              paddingTop: 24,
              paddingBottom: 8,
            }
          : null,
        isWide ? webSticky(16) : null,
        { gap: spacing.xs },
      ]}>
      <View style={[styles.sourceBadge, { gap: 4 }]}>
        {badgeImages.map((uri, i) => (
          <SourceBadgeAvatar key={`${uri}_${i}`} uri={uri} mutedColor={colors.textMuted} />
        ))}
        <Text style={[styles.sourceCount, { color: colors.textMuted }]}>
          {citations.length} {citations.length === 1 ? 'site' : 'sites'}
        </Text>
      </View>
      <View style={[styles.sourceListShell, { gap: spacing.xs }]}>
        {showAllSources ? (
          <AppScrollView
            scrollbarVariant="overlay"
            nestedScrollEnabled
            style={[styles.sourceListScroll, { maxHeight: EXPANDED_LIST_MAX_HEIGHT }]}
            contentContainerStyle={[styles.sourceListContent, { gap: spacing.xs }]}>
            {sourceCards(citations)}
          </AppScrollView>
        ) : (
          <View style={[styles.sourceListCollapsed, { gap: spacing.xs }]}>
            {sourceCards(collapsedSources)}
          </View>
        )}
      </View>
      {hasMoreSources ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showAllSources ? 'Show fewer sources' : 'Show all sources'}
          onPress={() => setShowAllSources((prev) => !prev)}
          style={({ pressed, hovered }) => [
            styles.showAllBtn,
            {
              borderColor: colors.border,
              backgroundColor: hovered ? colors.surfaceHover : colors.surface,
              opacity: pressed ? 0.85 : 1,
            },
            IS_WEB
              ? ({ cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '120ms' } as object)
              : null,
          ]}>
          <Text style={[styles.showAllText, { color: colors.text }]}>
            {showAllSources ? 'Show Less' : 'Show All'}
          </Text>
          {showAllSources ? (
            <ChevronUp size={14} color={colors.textMuted} />
          ) : (
            <ChevronDown size={14} color={colors.textMuted} />
          )}
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const answerColumn = (
    <View style={[styles.answerColumn, { gap: spacing.sm }]}>
      <View style={styles.aiTagRow}>
        <Sparkles size={16} color={colors.primary} strokeWidth={1.8} />
        <Text style={[styles.aiTagText, { color: colors.text }]}>AI Overview</Text>
        {answerHtml ? (
          <ExtensionSlot
            name="search.result.actions"
            contentKey={result?.id ?? 'search-stream'}
            text={answerHtml}
            disabled={isStreaming}
            language={language}
            iconColor={colors.textMuted}
            activeColor={colors.primary}
            selectedIconColor={colors.textOnPrimary}
            tooltipBackground={colors.surface}
            tooltipBorder={colors.ochre}
            tooltipColor={colors.text}
            surface="search"
          />
        ) : null}
      </View>

      {answerHtml ? (
        <AppHtmlBody html={answerHtml} speechContentKey={result?.id ?? 'search-stream'} />
      ) : null}

      {result ? (
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
      ) : null}

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

  const content = isWide ? (
    <View style={styles.twoColumn}>
      <View style={[styles.answerWrap, { paddingRight: spacing.md }]}>
        {answerColumn}
      </View>
      {hasSources ? sourceSidebar : (
        <View style={{ width: SIDEBAR_WIDTH, flexShrink: 0 }} />
      )}
    </View>
  ) : (
    <View style={{ gap: spacing.md }}>
      {answerColumn}
      {sourceSidebar}
    </View>
  );

  return (
    <View
      style={[
        styles.resultCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: spacing.md,
          borderRadius: 16,
        },
        IS_WEB ? ({ overflow: 'visible' } as object) : null,
      ]}>
      {content}
    </View>
  );
}

function SourceBadgeAvatar({ uri, mutedColor }: { uri: string; mutedColor: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;
  return (
    <View style={[styles.sourceDot, { backgroundColor: mutedColor, overflow: 'hidden' }]}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={styles.sourceDotImg}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  resultCard: {
    borderWidth: 1,
    width: '100%',
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
  twoColumn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
  answerWrap: {
    flex: 1,
    minWidth: 0,
  },
  answerColumn: {
    flex: 1,
    minWidth: 0,
  },
  sidebar: {
    flexShrink: 0,
  },
  /** Shared list width: always reserve thin-scrollbar gutter so expand does not reflow cards. */
  sourceListShell: {
    width: '100%',
    paddingRight: SOURCE_SCROLLBAR_GUTTER,
  },
  sourceListCollapsed: {
    width: '100%',
  },
  sourceListScroll: {
    // Wider than the shell content box by the gutter; thumb sits in that strip.
    width: '100%',
    marginRight: -SOURCE_SCROLLBAR_GUTTER,
    ...(IS_WEB
      ? ({
          width: `calc(100% + ${SOURCE_SCROLLBAR_GUTTER}px)`,
        } as object)
      : null),
  },
  sourceListContent: {
    width: '100%',
  },
  aiTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    ...(IS_WEB ? ({ overflow: 'visible' as const, zIndex: 1 } as object) : null),
  },
  aiTagText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginRight: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    ...(IS_WEB ? ({ overflow: 'visible' as const, zIndex: 1 } as object) : null),
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: -6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  sourceDotImg: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sourceCount: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 10,
  },
  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
