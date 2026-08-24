import React, { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Clock, X } from 'lucide-react-native';

import {
  SearchIconGlyph,
  searchIconAppliesToButton,
  searchIconWorksInField,
} from '@/features/search-config/components/settings/search-box-config-fields';
import { SearchWidgetResultPane } from '@/features/search-config/components/settings/SearchWidgetResultPane';
import type {
  PredefinedQuestion,
  SearchBoxConfig,
  SearchBoxCustomization,
  SearchTestCitation,
  SearchTestResult,
} from '@/features/search-config/types/search-config.types';
import type { SearchTestFeedbackSentiment } from '@/features/search-config/utils/search-test-feedback-options';
import { SEARCH_TEST_MIN_QUERY_LENGTH } from '@/features/search-config/utils/search-test-feedback-options';
import { SEARCH_TEST_MAX_QUERY_LENGTH } from '@/features/search-config/utils/search-test-options';
import { SEARCH_BOX_BORDER_RADIUS_PX } from '@/features/search-config/utils/search-box-config-options';
import {
  SEARCH_BOX_INNER_BG,
  SEARCH_BOX_WRAPPER_BG,
  resolveSearchBoxButtonColors,
} from '@/features/search-config/utils/search-box-preview-styles';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ExtensionSlot } from '@/platform/extension-slots';

const IS_WEB = Platform.OS === 'web';

export const DEFAULT_SEARCH_WIDGET_CUSTOMIZATION: SearchBoxCustomization = {
  searchFormType: 'with-button',
  buttonType: 'with-label',
  searchButtonText: 'Search',
  searchInputPlaceholder: 'Search using AI...',
  recentSearchEnabled: true,
  recentSearchTitle: 'Recent Searches',
};

export type SearchWidgetRecentItem = {
  id: string;
  text: string;
  timestamp: string;
};

export type SearchWidgetLiveSurfaceProps = {
  config: SearchBoxConfig | null | undefined;
  customization?: SearchBoxCustomization | null;
  predefinedQuestions: PredefinedQuestion[];
  recentSearches: SearchWidgetRecentItem[];
  query: string;
  onQueryChange: (text: string) => void;
  onSubmit: (queryOverride?: string) => void;
  onSelectRecent: (text: string) => void;
  onSelectQuestion: (text: string) => void;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  canSearch: boolean;
  showMinLengthError: boolean;
  showMaxLengthError: boolean;
  loading: boolean;
  streamingAnswer: string | null;
  streamingSources?: SearchTestCitation[];
  result: SearchTestResult | null;
  topK?: number;
  collectFeedback: boolean;
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
  queryAccessibilityLabel?: string;
  /** When false, only the query box / suggestions render — caller owns result chrome. */
  includeResults?: boolean;
};

export type SearchWidgetLiveSurfaceHandle = {
  focus: () => void;
};

export const SearchWidgetLiveSurface = React.forwardRef<
  SearchWidgetLiveSurfaceHandle,
  SearchWidgetLiveSurfaceProps
>(function SearchWidgetLiveSurface(
  {
    config,
    customization,
    predefinedQuestions,
    recentSearches,
    query,
    onQueryChange,
    onSubmit,
    onSelectRecent,
    onSelectQuestion,
    isFocused,
    onFocus,
    onBlur,
    canSearch,
    showMinLengthError,
    showMaxLengthError,
    loading,
    streamingAnswer,
    streamingSources,
    result,
    topK,
    collectFeedback,
    copied,
    onCopy,
    feedbackSentiment,
    feedbackLocked,
    feedbackSubmitting,
    onFeedbackSentiment,
    onCloseFeedback,
    onSubmitFeedback,
    queryAccessibilityLabel = 'Search query',
    includeResults = true,
  },
  ref,
) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const custom = customization ?? DEFAULT_SEARCH_WIDGET_CUSTOMIZATION;
  const borderRadius = config ? SEARCH_BOX_BORDER_RADIUS_PX[config.borderRadius] : 12;
  const placeholder = custom.searchInputPlaceholder.trim() || t('search.test.queryPlaceholder');
  const showIconInInput = config ? searchIconWorksInField(config, custom) : false;
  const showIconOnButton = searchIconAppliesToButton(custom);
  const withButton = custom.searchFormType === 'with-button';
  const labeledButton = withButton && custom.buttonType === 'with-label';
  const iconButton = withButton && custom.buttonType === 'search-icon';
  const buttonColors = config
    ? resolveSearchBoxButtonColors(config, colors.surfaceMuted, {
        iconMuted: colors.textMuted,
        iconOnCustom: colors.textOnPrimary,
      })
    : { isCustomizedStyle: false, buttonBgColor: colors.surfaceMuted, buttonIconColor: colors.textMuted };
  const showConfiguredLoader = loading && !streamingAnswer;
  const loaderType = config?.loader ?? 'skeleton';
  const showRecent = custom.recentSearchEnabled && recentSearches.length > 0 && isFocused;

  const inputRef = useRef<TextInput>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  const canSearchRef = useRef(canSearch);
  canSearchRef.current = canSearch;

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
  }));

  const handleGlobalEnter = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !queryRef.current.trim() || !canSearchRef.current) return;
      const active = document.activeElement;
      const isInputFocused = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (isInputFocused) return;
      e.preventDefault();
      onSubmit();
    },
    [onSubmit],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.addEventListener('keydown', handleGlobalEnter);
    return () => document.removeEventListener('keydown', handleGlobalEnter);
  }, [handleGlobalEnter]);

  return (
    <View style={{ gap: spacing.md, width: '100%' }}>
      <View style={styles.searchBarContainer}>
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
              ref={inputRef}
              {...searchInputAutofillProps}
              accessibilityLabel={queryAccessibilityLabel}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={(text) => onQueryChange(text.slice(0, SEARCH_TEST_MAX_QUERY_LENGTH))}
              onFocus={onFocus}
              onBlur={onBlur}
              onSubmitEditing={() => onSubmit()}
              returnKeyType="search"
              style={[getToolbarSearchInputStyle(typography.body), styles.input, { color: colors.text, flex: 1 }]}
            />
            {query.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search query"
                onPress={() => onQueryChange('')}
                hitSlop={8}
                style={styles.clearBtn}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
            <ExtensionSlot
              name="search.composer.trailing"
              value={query}
              onChangeText={onQueryChange}
              onVoiceCommitted={(text) => {
                const trimmed = text.trim();
                if (!trimmed) return;
                onQueryChange(trimmed);
                queueMicrotask(() => onSubmit(trimmed));
              }}
              disabled={loading}
              language={config?.language}
              iconColor={colors.textMuted}
              activeColor={colors.primary}
              surface="search"
            />
            {labeledButton ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={custom.searchButtonText.trim() || 'Search'}
                disabled={!canSearch}
                onPress={() => onSubmit()}
                style={({ pressed, hovered }) => [
                  styles.inlineSearchBtn,
                  {
                    borderRadius: Math.max(0, borderRadius - 2),
                    backgroundColor: buttonColors.buttonBgColor,
                    borderColor: buttonColors.isCustomizedStyle
                      ? buttonColors.buttonBgColor
                      : canSearch && (hovered || pressed)
                        ? colors.textMuted
                        : colors.border,
                    opacity: !canSearch ? 0.5 : pressed ? 0.88 : hovered ? 0.94 : 1,
                    ...(IS_WEB
                      ? ({
                          cursor: canSearch ? 'pointer' : 'default',
                          transitionProperty: 'opacity, border-color, transform',
                          transitionDuration: '150ms',
                          transform: canSearch && pressed ? 'scale(0.97)' : 'scale(1)',
                        } as object)
                      : null),
                  },
                ]}>
                <Text style={[typography.body, { color: buttonColors.buttonIconColor, fontSize: 14 }]}>
                  {custom.searchButtonText.trim() || 'Search'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {iconButton || !labeledButton ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Run search"
              disabled={!canSearch}
              onPress={() => onSubmit()}
              style={({ pressed, hovered }) => [
                styles.searchBtn,
                {
                  borderTopLeftRadius: iconButton ? 0 : borderRadius,
                  borderBottomLeftRadius: iconButton ? 0 : borderRadius,
                  borderTopRightRadius: borderRadius,
                  borderBottomRightRadius: borderRadius,
                  backgroundColor: buttonColors.buttonBgColor,
                  borderColor: buttonColors.isCustomizedStyle
                    ? buttonColors.buttonBgColor
                    : canSearch && (hovered || pressed)
                      ? colors.textMuted
                      : colors.border,
                  opacity: !canSearch ? 0.5 : pressed ? 0.88 : hovered ? 0.94 : 1,
                  ...(IS_WEB
                    ? ({
                        cursor: canSearch ? 'pointer' : 'default',
                        transitionProperty: 'opacity, border-color, transform',
                        transitionDuration: '150ms',
                        transform: canSearch && pressed ? 'scale(0.97)' : 'scale(1)',
                      } as object)
                    : null),
                },
              ]}>
              {loading ? (
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

      {showRecent ? (
        <View
          style={[
            styles.recentOverlay,
            {
              borderRadius: panelRadius,
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              padding: spacing.sm,
              gap: spacing.xs,
            },
          ]}>
          <Text style={[typography.caption, styles.recentLabel, { color: colors.textMuted }]}>
            {(custom.recentSearchTitle.trim() || 'Recent Searches').toUpperCase()}
          </Text>
          {recentSearches.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Run recent search ${item.text}`}
              onPress={() => onSelectRecent(item.text)}
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
      </View>

      {showMinLengthError ? (
        <Text style={[typography.caption, { color: colors.danger }]}>
          Please enter at least {SEARCH_TEST_MIN_QUERY_LENGTH} characters
        </Text>
      ) : null}
      {showMaxLengthError ? (
        <Text style={[typography.caption, { color: colors.danger }]}>
          Maximum {SEARCH_TEST_MAX_QUERY_LENGTH} characters allowed
        </Text>
      ) : null}

      {predefinedQuestions.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
            SUGGESTED QUESTIONS
          </Text>
          <View style={[styles.chipRow, { gap: spacing.xs }]}>
            {predefinedQuestions.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Search suggested question ${item.text}`}
                onPress={() => onSelectQuestion(item.text)}
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

      {includeResults ? (
        <SearchWidgetResultPane
          loaderType={loaderType}
          showConfiguredLoader={showConfiguredLoader}
          streamingAnswer={streamingAnswer}
          streamingSources={streamingSources}
          loading={loading}
          result={result}
          topK={topK}
          collectFeedback={collectFeedback}
          language={config?.language}
          copied={copied}
          onCopy={onCopy}
          feedbackSentiment={feedbackSentiment}
          feedbackLocked={feedbackLocked}
          feedbackSubmitting={feedbackSubmitting}
          onFeedbackSentiment={onFeedbackSentiment}
          onCloseFeedback={onCloseFeedback}
          onSubmitFeedback={onSubmitFeedback}
        />
      ) : null}
    </View>
  );
});

SearchWidgetLiveSurface.displayName = 'SearchWidgetLiveSurface';

const styles = StyleSheet.create({
  searchBarContainer: {
    position: 'relative',
    width: '100%',
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  } as const,
  searchWrapper: {
    width: '100%',
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
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
  recentOverlay: {
    borderWidth: 1,
    width: '100%',
  },
  recentLabel: { letterSpacing: 0.8, fontSize: 11 },
  recentRow: { flexDirection: 'row', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, maxWidth: '100%' },
});
