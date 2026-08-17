import React from 'react';
import {
  ActivityIndicator,
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
  onSubmit: () => void;
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
  showLatency?: boolean;
  queryAccessibilityLabel?: string;
  /** When false, only the query box / suggestions render — caller owns result chrome. */
  includeResults?: boolean;
};

export function SearchWidgetLiveSurface({
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
  showLatency = true,
  queryAccessibilityLabel = 'Search query',
  includeResults = true,
}: SearchWidgetLiveSurfaceProps) {
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

  return (
    <View style={{ gap: spacing.md, width: '100%' }}>
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
              accessibilityLabel={queryAccessibilityLabel}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={(text) => onQueryChange(text.slice(0, SEARCH_TEST_MAX_QUERY_LENGTH))}
              onFocus={onFocus}
              onBlur={onBlur}
              onSubmitEditing={onSubmit}
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
            {labeledButton ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={custom.searchButtonText.trim() || 'Search'}
                disabled={!canSearch}
                onPress={onSubmit}
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
              onPress={onSubmit}
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

      {showRecent ? (
        <View
          style={[
            styles.recentBlock,
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

      {includeResults ? (
        <SearchWidgetResultPane
          loaderType={loaderType}
          showConfiguredLoader={showConfiguredLoader}
          streamingAnswer={streamingAnswer}
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
          showLatency={showLatency}
        />
      ) : null}
    </View>
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
});
