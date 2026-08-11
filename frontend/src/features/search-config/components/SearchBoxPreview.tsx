import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Clock, Sparkles } from 'lucide-react-native';

import { SearchBoxLoaderPreview } from '@/features/search-config/components/SearchBoxLoaderPreview';
import {
  SearchIconGlyph,
  searchIconAppliesToButton,
  searchIconWorksInField,
} from '@/features/search-config/components/settings/search-box-config-fields';
import type {
  PredefinedQuestionsSettings,
  SearchBoxConfig,
  SearchBoxCustomization,
} from '@/features/search-config/types/search-config.types';
import { previewPredefinedQuestions } from '@/features/search-config/utils/predefined-questions';
import {
  SEARCH_BOX_BORDER_RADIUS_PX,
  SEARCH_BOX_RECENT_SEARCH_PREVIEW,
} from '@/features/search-config/utils/search-box-config-options';
import {
  SEARCH_BOX_INNER_BG,
  SEARCH_BOX_WRAPPER_BG,
  resolveSearchBoxButtonColors,
} from '@/features/search-config/utils/search-box-preview-styles';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { ActionIcons } from '@/shared/constants/action-icons';

const DEFAULT_CUSTOMIZATION: SearchBoxCustomization = {
  searchFormType: 'with-button',
  buttonType: 'search-icon',
  searchButtonText: 'Search',
  searchInputPlaceholder: 'Search using AI...',
  recentSearchEnabled: true,
  recentSearchTitle: 'Recent Searches',
};

type Props = {
  config: SearchBoxConfig;
  customization?: SearchBoxCustomization | null;
  predefinedQuestions?: PredefinedQuestionsSettings | null;
  previewContext?: 'configuration' | 'customisation' | 'questions';
  showLoaderPreview?: boolean;
  accessibilityLabel?: string;
};

export function SearchBoxPreview({
  config,
  customization,
  predefinedQuestions,
  previewContext = 'configuration',
  showLoaderPreview = false,
  accessibilityLabel,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, elevation, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const panelRadius = surfaceRadius.card;
  const custom = customization ?? DEFAULT_CUSTOMIZATION;
  const borderRadius = SEARCH_BOX_BORDER_RADIUS_PX[config.borderRadius];
  const { isCustomizedStyle, buttonBgColor, buttonIconColor } = resolveSearchBoxButtonColors(
    config,
    colors.surfaceMuted,
    { iconMuted: colors.textMuted, iconOnCustom: colors.textOnPrimary },
  );
  const showIconInInput = searchIconWorksInField(config, custom);
  const showIconOnButton = searchIconAppliesToButton(custom);
  const withButton = custom.searchFormType === 'with-button';
  const labeledButton = withButton && custom.buttonType === 'with-label';
  const iconButton = withButton && custom.buttonType === 'search-icon';
  const placeholder =
    custom.searchInputPlaceholder.trim() || t('search.customisation.inputPlaceholder.placeholder');
  const recentTitle =
    custom.recentSearchTitle.trim() || t('search.customisation.recentSearch.titlePlaceholder');

  const suggestedQuestions =
    predefinedQuestions?.enabled && predefinedQuestions
      ? previewPredefinedQuestions(predefinedQuestions)
      : [];
  const showSuggested = suggestedQuestions.length > 0;
  const showRecent = !showSuggested && custom.recentSearchEnabled;
  const showLoader = showLoaderPreview;

  const previewLabel =
    accessibilityLabel ??
    (previewContext === 'customisation'
      ? t('search.widget.preview.a11y.customisation')
      : previewContext === 'questions'
        ? t('search.widget.preview.a11y.questions')
        : t('search.widget.preview.a11y.configuration'));

  const previewSubtitle = t('search.widget.preview.subtitle');

  return (
    <View
      accessibilityLabel={previewLabel}
      style={[
        styles.card,
        elevation.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: panelRadius,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}>
      <View style={{ gap: 4 }}>
        <Text style={[typography.headingSemibold, { color: colors.text }]}>
          {t('search.widget.preview.title')}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{previewSubtitle}</Text>
      </View>

      <View
        style={[
          styles.widgetShell,
          {
            borderColor: colors.border,
            borderRadius: panelRadius,
            backgroundColor: colors.surface,
            padding: spacing.md,
            gap: spacing.md,
          },
        ]}>
        <View style={[styles.widgetHeader, { gap: spacing.xs }]}>
          <View style={styles.titleIconWrap}>
            <SearchIconGlyph type={config.searchIcon} color={colors.textMuted} size={16} />
            <Sparkles
              size={10}
              color={colors.textMuted}
              fill={colors.textMuted}
              style={styles.titleSparkle}
            />
          </View>
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
            {config.title.trim() || t('search.config.titlePlaceholder')}
          </Text>
        </View>

        <View
          style={[
            styles.searchWrapper,
            {
              backgroundColor: SEARCH_BOX_WRAPPER_BG,
              borderRadius,
              padding: 8,
            },
          ]}>
          <View style={[styles.searchRow, { gap: 0 }]}>
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
                  paddingRight: labeledButton ? 6 : 12,
                  minHeight: 44,
                },
              ]}>
              {showIconInInput ? (
                <SearchIconGlyph type={config.searchIcon} color={colors.textMuted} size={18} />
              ) : null}
              <TextInput
                {...searchInputAutofillProps}
                accessibilityLabel={t('search.widget.preview.input.a11y')}
                editable={false}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                style={[getToolbarSearchInputStyle(typography.body), styles.input, { color: colors.text, flex: 1 }]}
              />
              {labeledButton ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={custom.searchButtonText.trim() || t('search.test.searchButton')}
                  style={[
                    styles.inlineSearchBtn,
                    {
                      borderRadius: Math.max(0, borderRadius - 2),
                      backgroundColor: buttonBgColor,
                      borderColor: isCustomizedStyle ? buttonBgColor : colors.border,
                    },
                  ]}>
                  <Text
                    style={[typography.body, { color: buttonIconColor, fontWeight: '500', fontSize: 14 }]}
                    numberOfLines={1}>
                    {custom.searchButtonText.trim() || t('search.test.searchButton')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {iconButton ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('search.test.searchButton')}
                style={[
                  styles.searchBtn,
                  {
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    borderTopRightRadius: borderRadius,
                    borderBottomRightRadius: borderRadius,
                    backgroundColor: buttonBgColor,
                    borderColor: isCustomizedStyle ? buttonBgColor : colors.border,
                  },
                ]}>
                {showIconOnButton ? (
                  <SearchIconGlyph type={config.searchIcon} color={buttonIconColor} size={18} />
                ) : (
                  <SearchIconGlyph type="search" color={buttonIconColor} size={18} />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        {showSuggested ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
              {t('search.widget.preview.suggestedQuestions')}
            </Text>
            {suggestedQuestions.map((question) => (
              <View
                key={question.id}
                style={[
                  styles.suggestedChip,
                  {
                    borderColor: colors.border,
                    borderRadius: controlRadius,
                    backgroundColor: colors.surfaceMuted,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                    gap: spacing.sm,
                  },
                ]}>
                <Text style={[typography.body, { color: colors.text, flex: 1, fontSize: 14 }]} numberOfLines={2}>
                  {question.text}
                </Text>
                <ActionIcons.help size={16} color={colors.textMuted} />
              </View>
            ))}
          </View>
        ) : null}

        {showRecent ? (
          <View
            style={[
              styles.recentBlock,
              {
                borderRadius: controlRadius,
                backgroundColor: colors.surfaceMuted,
                padding: spacing.sm,
                gap: spacing.xs,
              },
            ]}>
            <Text style={[typography.caption, styles.recentLabel, { color: colors.textMuted }]}>
              {recentTitle.toUpperCase()}
            </Text>
            {SEARCH_BOX_RECENT_SEARCH_PREVIEW.map((item, index) => (
              <View
                key={item}
                style={[
                  styles.recentRow,
                  { gap: spacing.sm, paddingVertical: 6 },
                  index < SEARCH_BOX_RECENT_SEARCH_PREVIEW.length - 1
                    ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }
                    : null,
                ]}>
                <Clock size={14} color={colors.textMuted} />
                <Text style={[typography.body, { color: colors.text, flex: 1, fontSize: 14 }]} numberOfLines={1}>
                  {item}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('search.widget.preview.justNow')}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {showLoader ? (
          <View
            style={[
              styles.loaderCard,
              {
                borderColor: colors.border,
                borderRadius: panelRadius,
                backgroundColor: colors.surface,
                padding: spacing.md,
              },
            ]}>
            <SearchBoxLoaderPreview loader={config.loader} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, width: '100%' },
  widgetShell: { borderWidth: 1, width: '100%' },
  widgetHeader: { flexDirection: 'row', alignItems: 'center' },
  titleIconWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  titleSparkle: { position: 'absolute', top: -2, right: -2 },
  searchWrapper: { width: '100%' },
  searchRow: { flexDirection: 'row', alignItems: 'stretch', width: '100%' },
  inputShell: { flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  input: { paddingVertical: 0, minWidth: 0 },
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
    borderWidth: 0,
  },
  recentBlock: { width: '100%' },
  recentLabel: { letterSpacing: 0.8, fontSize: 11 },
  recentRow: { flexDirection: 'row', alignItems: 'center' },
  suggestedChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, width: '100%' },
  loaderCard: { borderWidth: 1, width: '100%' },
});
