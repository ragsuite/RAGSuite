import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Quote } from 'lucide-react-native';

import { CitationFormattingPreview } from '@/features/search-config/components/settings/CitationFormattingPreview';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import type { CitationFormat } from '@/features/search-config/types/search-config.types';
import { DEFAULT_CITATION_FORMAT } from '@/features/search-config/utils/search-api-mappers';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

const CITATION_STYLE_OPTIONS = (t: (key: string) => string) => [
  { key: 'compact' as const, label: t('search.citations.style.compact') },
  { key: 'detailed' as const, label: t('search.citations.style.detailed') },
  { key: 'card' as const, label: t('search.citations.style.card') },
  { key: 'minimal' as const, label: t('search.citations.style.minimal') },
];

const LAYOUT_OPTIONS = (t: (key: string) => string) => [
  { key: 'vertical' as const, label: t('search.citations.layout.vertical') },
  { key: 'grid' as const, label: t('search.citations.layout.grid') },
];

const NUMBERING_STYLE_OPTIONS = (t: (key: string) => string) => [
  { key: 'square' as const, label: t('search.citations.numbering.brackets') },
  { key: 'parentheses' as const, label: t('search.citations.numbering.parentheses') },
  { key: 'periods' as const, label: t('search.citations.numbering.dots') },
  { key: 'plain' as const, label: t('search.citations.numbering.numbers') },
];

const COLOR_SCHEME_OPTIONS = (t: (key: string) => string) => [
  { key: 'default' as const, label: t('search.citations.colours.default') },
  { key: 'primary' as const, label: t('search.citations.colours.primary') },
  { key: 'muted' as const, label: t('search.citations.colours.muted') },
  { key: 'accent' as const, label: t('search.citations.colours.accent') },
];

const RESET_FORMAT: CitationFormat = {
  ...DEFAULT_CITATION_FORMAT,
  citationStyle: 'detailed',
  layout: 'vertical',
  numberingStyle: 'square',
  colorScheme: 'default',
  showUrls: true,
  showSourceCount: true,
  showSnippets: true,
  enableHoverEffects: false,
  maxSnippetLength: 150,
};

export function CitationFormattingPanel() {
  const { spacing, typography, colors } = useAppTheme();
  const { t } = useTranslation();
  const { isCompact } = useSearchConfigLayout();
  const { bundle, saving, handleSaveCitation } = useSearchConfig();
  const [draft, setDraft] = useState<CitationFormat | null>(null);

  useEffect(() => {
    if (bundle?.citationFormat) setDraft(bundle.citationFormat);
  }, [bundle?.citationFormat]);

  const dirty = draft && bundle ? JSON.stringify(draft) !== JSON.stringify(bundle.citationFormat) : false;

  return (
    <StatePanel isEmpty={!draft} emptyLabel={t('search.citations.unavailable')}>
      {draft ? (
        <SearchConfigPanelCard
          icon={Quote}
          title={t('search.citations.title')}
          subtitle={t('search.citations.description')}>
          <View style={[styles.formStack, { gap: spacing.md }]}>
            <View style={[styles.grid, { gap: spacing.sm }]}>
              <View style={[styles.gridItem, isCompact ? null : styles.gridItemHalf]}>
                <AppSelectField
                  label={t('search.citations.style.label')}
                  value={draft.citationStyle}
                  options={CITATION_STYLE_OPTIONS(t)}
                  onChange={(citationStyle) => setDraft((prev) => (prev ? { ...prev, citationStyle } : prev))}
                />
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('search.citations.style.helper')}</Text>
              </View>

              <View style={[styles.gridItem, isCompact ? null : styles.gridItemHalf]}>
                <AppSelectField
                  label={t('search.citations.layout.label')}
                  value={draft.layout}
                  options={LAYOUT_OPTIONS(t)}
                  onChange={(layout) => setDraft((prev) => (prev ? { ...prev, layout } : prev))}
                />
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('search.citations.layout.helper')}</Text>
              </View>

              <View style={[styles.gridItem, isCompact ? null : styles.gridItemHalf]}>
                <AppSelectField
                  label={t('search.citations.numbering.label')}
                  value={draft.numberingStyle}
                  options={NUMBERING_STYLE_OPTIONS(t)}
                  onChange={(numberingStyle) => setDraft((prev) => (prev ? { ...prev, numberingStyle } : prev))}
                />
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('search.citations.numbering.helper')}</Text>
              </View>

              <View style={[styles.gridItem, isCompact ? null : styles.gridItemHalf]}>
                <AppSelectField
                  label={t('search.citations.colours.label')}
                  value={draft.colorScheme}
                  options={COLOR_SCHEME_OPTIONS(t)}
                  onChange={(colorScheme) => setDraft((prev) => (prev ? { ...prev, colorScheme } : prev))}
                />
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('search.citations.colours.helper')}</Text>
              </View>
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.fieldLabel, styles.sectionTitle, { color: colors.text }]}>{t('search.citations.displayOptions.title')}</Text>
              <AppSwitchRow
                bordered
                label={t('search.citations.displayOptions.showUrls')}
                description={t('search.citations.displayOptions.showUrlsHelper')}
                value={draft.showUrls}
                onChange={(showUrls) => setDraft((prev) => (prev ? { ...prev, showUrls } : prev))}
              />
              <AppSwitchRow
                bordered
                label={t('search.citations.displayOptions.showSourceCount')}
                description={t('search.citations.displayOptions.showSourceCountHelper')}
                value={draft.showSourceCount}
                onChange={(showSourceCount) => setDraft((prev) => (prev ? { ...prev, showSourceCount } : prev))}
              />
            </View>

            <CitationFormattingPreview format={draft} />

            <View style={[styles.actions, { gap: spacing.xs, marginTop: spacing.xs }]}>
              <AppButton
                variant="cta"
                size="compact"
                label={t('search.citations.save')}
                icon={ActionIcons.save}
                loading={saving}
                disabled={!dirty || saving}
                onPress={() => void handleSaveCitation(draft)}
              />
              <AppButton
                variant="outline"
                size="compact"
                label={t('search.citations.reset')}
                disabled={saving}
                onPress={() => setDraft({ ...RESET_FORMAT })}
              />
            </View>
          </View>
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  formStack: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '100%',
    minWidth: 0,
    gap: 4,
  },
  gridItemHalf: {
    width: '49%',
  },
  sectionTitle: {
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
