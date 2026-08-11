import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, Clock, FlaskConical, ThumbsDown, ThumbsUp, X } from 'lucide-react-native';

import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchBoxLoaderPreview } from '@/features/search-config/components/SearchBoxLoaderPreview';
import {
  SearchIconGlyph,
  searchIconAppliesToButton,
  searchIconWorksInField,
} from '@/features/search-config/components/settings/search-box-config-fields';
import { SearchTestFeedbackForm } from '@/features/search-config/components/settings/SearchTestFeedbackForm';
import { SearchTestSourcesList } from '@/features/search-config/components/settings/SearchTestSourcesList';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { SearchBoxCustomization } from '@/features/search-config/types/search-config.types';
import type { SearchTestFeedbackSentiment } from '@/features/search-config/utils/search-test-feedback-options';
import { SEARCH_TEST_MIN_QUERY_LENGTH } from '@/features/search-config/utils/search-test-feedback-options';
import { SEARCH_TEST_MAX_QUERY_LENGTH } from '@/features/search-config/utils/search-test-options';
import { SEARCH_BOX_BORDER_RADIUS_PX } from '@/features/search-config/utils/search-box-config-options';
import {
  SEARCH_BOX_INNER_BG,
  SEARCH_BOX_WRAPPER_BG,
  resolveSearchBoxButtonColors,
} from '@/features/search-config/utils/search-box-preview-styles';
import { SEARCH_CONFIG_TOUCH_MIN } from '@/features/search-config/utils/search-config-mobile';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { AppHtmlBody } from '@/shared/components/app-html-body';
import { copyText } from '@/shared/utils/copy-text';
import { getRenderablePlainText } from '@/shared/utils/html-content';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { ActionIcons } from '@/shared/constants/action-icons';

const IS_WEB = Platform.OS === 'web';

type ActionChrome = {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
};

function resolveActionChrome(
  colors: ReturnType<typeof useAppTheme>['colors'],
  {
    pressed,
    hovered,
    selected,
    disabled,
  }: {
    pressed: boolean;
    hovered: boolean;
    selected: boolean;
    disabled?: boolean;
  },
): ActionChrome {
  if (disabled && !selected) {
    return {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      iconColor: colors.textMuted,
    };
  }
  if (selected) {
    return {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      iconColor: colors.textOnPrimary,
    };
  }
  if (pressed || hovered) {
    return {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.ochre,
      iconColor: colors.ochre,
    };
  }
  return {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    iconColor: colors.textMuted,
  };
}

type TestActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  /** Avoid clipping when the control sits on the leading edge of a card. */
  tooltipAlign?: 'start' | 'center';
  children: (iconColor: string) => React.ReactNode;
};

function TestActionButton({
  label,
  onPress,
  disabled = false,
  selected = false,
  tooltipAlign = 'center',
  children,
}: TestActionButtonProps) {
  const { colors } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const showTooltip = IS_WEB && hovered && !disabled;

  return (
    <View style={styles.actionBtnWrap}>
      {showTooltip ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.actionTooltip,
            tooltipAlign === 'start' ? styles.actionTooltipStart : styles.actionTooltipCenter,
            {
              backgroundColor: colors.surface,
              borderColor: colors.ochre,
            },
          ]}>
          <Text style={[styles.actionTooltipText, { color: colors.text }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed, hovered: webHovered }) => {
          const chrome = resolveActionChrome(colors, {
            pressed: Boolean(pressed),
            hovered: hovered || Boolean(webHovered),
            selected,
            disabled,
          });
          return [
            styles.actionBtn,
            {
              borderColor: chrome.borderColor,
              backgroundColor: chrome.backgroundColor,
              opacity: disabled && !selected ? 0.45 : 1,
              ...(IS_WEB
                ? ({
                    cursor: disabled ? 'default' : 'pointer',
                    transitionProperty: 'background-color, border-color, opacity',
                    transitionDuration: '150ms',
                  } as object)
                : null),
            },
          ];
        }}>
        {({ pressed, hovered: webHovered }) => {
          const chrome = resolveActionChrome(colors, {
            pressed: Boolean(pressed),
            hovered: hovered || Boolean(webHovered),
            selected,
            disabled,
          });
          return children(chrome.iconColor);
        }}
      </Pressable>
    </View>
  );
}
const DEFAULT_CUSTOMIZATION: SearchBoxCustomization = {
  searchFormType: 'with-button',
  buttonType: 'with-label',
  searchButtonText: 'Search',
  searchInputPlaceholder: 'Search using AI...',
  recentSearchEnabled: true,
  recentSearchTitle: 'Recent Searches',
};

function formatRecentTimestamp(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return t('search.test.time.justNow');
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return t('search.test.time.minutesAgoShort', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('search.test.time.hoursAgoShort', { count: hours });
  return t('search.test.time.earlier');
}

export function SearchTestPanel() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const {
    bundle,
    testResult,
    testLoading,
    testStreamingAnswer,
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

  // New search result → allow feedback again for that query only.
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

  const handleSearchFocus = () => {
    clearBlurHideTimeout();
    setIsFocused(true);
  };

  const handleSearchBlur = () => {
    // Delay hide so a Pressable recent-item click can register before unmount.
    clearBlurHideTimeout();
    blurHideTimeoutRef.current = setTimeout(() => {
      setIsFocused(false);
      blurHideTimeoutRef.current = null;
    }, 150);
  };

  const config = bundle?.searchBoxConfig;
  const customization = bundle?.searchBoxCustomization ?? DEFAULT_CUSTOMIZATION;
  const borderRadius = config ? SEARCH_BOX_BORDER_RADIUS_PX[config.borderRadius] : 12;
  const placeholder = customization.searchInputPlaceholder.trim() || t('search.test.queryPlaceholder');
  const showIconInInput = config ? searchIconWorksInField(config, customization) : false;
  const showIconOnButton = searchIconAppliesToButton(customization);
  const withButton = customization.searchFormType === 'with-button';
  const labeledButton = withButton && customization.buttonType === 'with-label';
  const iconButton = withButton && customization.buttonType === 'search-icon';
  const buttonColors = config
    ? resolveSearchBoxButtonColors(config, colors.surfaceMuted, {
        iconMuted: colors.textMuted,
        iconOnCustom: colors.textOnPrimary,
      })
    : { isCustomizedStyle: false, buttonBgColor: colors.surfaceMuted, buttonIconColor: colors.textMuted };
  const showConfiguredLoader = testLoading && !testStreamingAnswer;
  const loaderType = config?.loader ?? 'skeleton';

  const trimmed = query.trim();
  const showMinLengthError =
    trimmed.length > 0 && trimmed.length < SEARCH_TEST_MIN_QUERY_LENGTH;
  const showMaxLengthError = query.length > SEARCH_TEST_MAX_QUERY_LENGTH;
  const canSearch =
    trimmed.length >= SEARCH_TEST_MIN_QUERY_LENGTH &&
    trimmed.length <= SEARCH_TEST_MAX_QUERY_LENGTH &&
    !testLoading;

  const predefinedQuestions = useMemo(() => {
    const settings = bundle?.predefinedQuestions;
    if (!settings?.enabled) return [];
    return settings.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .slice(0, settings.questionLimit);
  }, [bundle?.predefinedQuestions]);

  const collectFeedback = bundle?.searchBoxConfig?.collectUserFeedback ?? true;

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
  }, [bundle?.searchHistory]);

  const runSearch = () => {
    if (!canSearch) return;
    clearBlurHideTimeout();
    setFeedbackSentiment(null);
    setFeedbackSubmitted(false);
    setIsFocused(false);
    void handleRunSearchTest(trimmed);
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

  const feedbackLocked = feedbackSubmitted;

  return (
    <SearchConfigPanelCard
      icon={FlaskConical}
      title={t('search.test.title')}
      subtitle={t('search.test.subtitle')}>
      <View style={{ gap: spacing.md }}>
      <SectionCard>
        <View
          style={[
            styles.searchWrapper,
            {
              backgroundColor: SEARCH_BOX_WRAPPER_BG,
              borderRadius,
              padding: 8,
            },
          ]}>
          <View style={[styles.searchRow, { gap: iconButton ? 0 : 8 }]}>
            <View
              style={[
                styles.inputShell,
                {
                  flex: 1,
                  borderRadius,
                  borderTopRightRadius: iconButton ? 0 : borderRadius,
                  borderBottomRightRadius: iconButton ? 0 : borderRadius,
                  backgroundColor: SEARCH_BOX_INNER_BG,
                  paddingLeft: showIconInInput ? 12 : 14,
                  paddingRight: 8,
                  minHeight: 44,
                },
              ]}>
              {showIconInInput && config ? (
                <SearchIconGlyph type={config.searchIcon} color={colors.textMuted} size={18} />
              ) : null}
              <TextInput
                {...searchInputAutofillProps}
                accessibilityLabel="Search test query"
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={(text) => setQuery(text.slice(0, SEARCH_TEST_MAX_QUERY_LENGTH))}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                onSubmitEditing={runSearch}
                returnKeyType="search"
                style={[getToolbarSearchInputStyle(typography.body), styles.input, { color: colors.text, flex: 1 }]}
              />
              {query.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search query"
                  onPress={() => setQuery('')}
                  hitSlop={8}
                  style={styles.clearBtn}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
              {labeledButton ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={customization.searchButtonText.trim() || 'Search'}
                  disabled={!canSearch}
                  onPress={runSearch}
                  style={[
                    styles.inlineSearchBtn,
                    {
                      borderRadius: Math.max(0, borderRadius - 2),
                      backgroundColor: buttonColors.buttonBgColor,
                      borderColor: buttonColors.isCustomizedStyle
                        ? buttonColors.buttonBgColor
                        : colors.border,
                      opacity: canSearch ? 1 : 0.5,
                    },
                  ]}>
                  <Text
                    style={[
                      typography.body,
                      { color: buttonColors.buttonIconColor, fontSize: 14 },
                    ]}>
                    {customization.searchButtonText.trim() || 'Search'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {iconButton || !labeledButton ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Run search test"
                disabled={!canSearch}
                onPress={runSearch}
                style={[
                  styles.searchBtn,
                  {
                    borderTopLeftRadius: iconButton ? 0 : borderRadius,
                    borderBottomLeftRadius: iconButton ? 0 : borderRadius,
                    borderTopRightRadius: borderRadius,
                    borderBottomRightRadius: borderRadius,
                    backgroundColor: buttonColors.buttonBgColor,
                    borderColor: buttonColors.isCustomizedStyle
                      ? buttonColors.buttonBgColor
                      : colors.border,
                    opacity: canSearch ? 1 : 0.5,
                  },
                ]}>
                {testLoading ? (
                  <ActivityIndicator size="small" color={buttonColors.buttonIconColor} />
                ) : showIconOnButton && config ? (
                  <SearchIconGlyph type={config.searchIcon} color={buttonColors.buttonIconColor} size={18} />
                ) : (
                  <SearchIconGlyph type="search" color={buttonColors.buttonIconColor} size={18} />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        {showMinLengthError ? (
          <Text style={[typography.caption, { color: colors.danger, marginTop: 4 }]}>
            Please enter at least {SEARCH_TEST_MIN_QUERY_LENGTH} characters
          </Text>
        ) : null}
        {showMaxLengthError ? (
          <Text style={[typography.caption, { color: colors.danger, marginTop: 4 }]}>
            Maximum {SEARCH_TEST_MAX_QUERY_LENGTH} characters allowed
          </Text>
        ) : null}

        {predefinedQuestions.length > 0 ? (
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
              SUGGESTED QUESTIONS
            </Text>
            <View style={[styles.chipRow, { gap: spacing.xs }]}>
              {predefinedQuestions.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Search suggested question ${item.text}`}
                  onPress={() => {
                    setQuery(item.text);
                    setFeedbackSentiment(null);
                    if (item.text.trim().length >= SEARCH_TEST_MIN_QUERY_LENGTH) {
                      void handleRunSearchTest(item.text.trim());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                      borderRadius: surfaceRadius.button,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xs,
                    },
                  ]}>
                  <Text style={[typography.caption, { color: colors.text }]} numberOfLines={2}>
                    {item.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {customization.recentSearchEnabled && recentSearches.length > 0 && isFocused ? (
          <View
            style={[
              styles.recentBlock,
              {
                marginTop: spacing.sm,
                borderRadius: panelRadius,
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                padding: spacing.sm,
                gap: spacing.xs,
              },
            ]}>
            <Text style={[typography.caption, styles.recentLabel, { color: colors.textMuted }]}>
              {(customization.recentSearchTitle.trim() || 'Recent Searches').toUpperCase()}
            </Text>
            {recentSearches.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Run recent search ${item.text}`}
                onPress={() => selectRecent(item.text)}
                style={({ pressed, hovered }) => [
                  styles.recentRow,
                  {
                    gap: spacing.sm,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  },
                  index < recentSearches.length - 1
                    ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }
                    : null,
                ]}>
                <Clock size={14} color={colors.textMuted} />
                <Text style={[typography.body, { color: colors.text, flex: 1, fontSize: 14 }]} numberOfLines={1}>
                  {item.text}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{item.timestamp}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </SectionCard>

      {showConfiguredLoader ? (
        <SectionCard>
          <SearchBoxLoaderPreview loader={loaderType} />
        </SectionCard>
      ) : null}

      {testLoading && testStreamingAnswer ? (
        <SectionCard>
          <AppHtmlBody html={testStreamingAnswer} />
        </SectionCard>
      ) : null}

      {testResult ? (
        <SectionCard>
          <AppHtmlBody html={testResult.answer} />

          {testResult.latencyMs > 0 ? (
            <Text style={[typography.caption, typography.numeric, { color: colors.textMuted, marginTop: spacing.xs }]}>
              Response time: {testResult.latencyMs}ms
            </Text>
          ) : null}

          <SearchTestSourcesList
            citations={testResult.citations}
            topK={bundle?.modelSettings?.topKResults}
          />

          <View style={[styles.actions, { gap: spacing.sm, marginTop: spacing.sm }]}>
            <TestActionButton
              label={t('chatbot.widget.app.copyResponse.a11y')}
              tooltipAlign="start"
              onPress={() => void copyAnswer()}>
              {(iconColor) =>
                copied ? (
                  <Check size={16} color={colors.ochre} strokeWidth={2} />
                ) : (
                  <ActionIcons.copy size={16} color={iconColor} strokeWidth={2} />
                )
              }
            </TestActionButton>
            {collectFeedback ? (
              <>
                <TestActionButton
                  label={t('chatbot.widget.app.thumbsUp.a11y')}
                  selected={feedbackSentiment === 'positive'}
                  disabled={feedbackLocked}
                  onPress={() => {
                    if (feedbackLocked) return;
                    setFeedbackSentiment('positive');
                  }}>
                  {(iconColor) => (
                    <ThumbsUp
                      size={16}
                      color={iconColor}
                      strokeWidth={2}
                      fill={feedbackSentiment === 'positive' ? iconColor : 'none'}
                    />
                  )}
                </TestActionButton>
                <TestActionButton
                  label={t('chatbot.widget.app.thumbsDown.a11y')}
                  selected={feedbackSentiment === 'negative'}
                  disabled={feedbackLocked}
                  onPress={() => {
                    if (feedbackLocked) return;
                    setFeedbackSentiment('negative');
                  }}>
                  {(iconColor) => (
                    <ThumbsDown
                      size={16}
                      color={iconColor}
                      strokeWidth={2}
                      fill={feedbackSentiment === 'negative' ? iconColor : 'none'}
                    />
                  )}
                </TestActionButton>
              </>
            ) : null}
          </View>

          {collectFeedback && feedbackSentiment && !feedbackLocked ? (
            <SearchTestFeedbackForm
              sentiment={feedbackSentiment}
              language={config?.language}
              submitting={saving}
              onClose={() => setFeedbackSentiment(null)}
              onSubmit={submitFeedback}
            />
          ) : null}
        </SectionCard>
      ) : null}
      </View>
    </SearchConfigPanelCard>
  );
}

const styles = StyleSheet.create({
  searchWrapper: { width: '100%' },
  searchRow: { flexDirection: 'row', alignItems: 'stretch', width: '100%' },
  inputShell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { paddingVertical: 0, minWidth: 0 },
  clearBtn: { padding: 2 },
  inlineSearchBtn: {
    minHeight: 32,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  searchBtn: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  recentBlock: { borderWidth: 1, width: '100%' },
  recentLabel: { letterSpacing: 0.8, fontSize: 11 },
  recentRow: { flexDirection: 'row', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, maxWidth: '100%' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    ...(IS_WEB ? ({ overflow: 'visible' as const, zIndex: 1 } as object) : null),
  },
  actionBtnWrap: {
    position: 'relative',
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
  actionTooltip: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    zIndex: 30,
    ...(IS_WEB
      ? ({
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.12)',
        } as object)
      : null),
  },
  actionTooltipStart: {
    left: 0,
  },
  actionTooltipCenter: {
    left: '50%',
    ...(IS_WEB ? ({ transform: 'translateX(-50%)' } as object) : { transform: [{ translateX: -40 }] }),
  },
  actionTooltipText: {
    fontSize: 11,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
