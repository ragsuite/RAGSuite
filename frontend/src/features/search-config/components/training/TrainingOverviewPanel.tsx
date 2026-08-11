import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bot } from 'lucide-react-native';

import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { StatusBadge } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

function countWords(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function TrainingOverviewPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { isCompact } = useSearchConfigLayout();
  const { bundle } = useSearchConfig();
  const overview = bundle?.trainingOverview;
  const modelSettings = bundle?.modelSettings;
  const historySessionCount = useMemo(() => {
    if (!bundle?.searchHistory?.length) return 0;
    return new Set(bundle.searchHistory.map((item) => item.session_id)).size;
  }, [bundle?.searchHistory]);
  const historyMessageCount = bundle?.searchHistory?.length ?? 0;
  const promptText = modelSettings?.systemPrompt ?? '';
  const promptChars = promptText.length;
  const promptWords = countWords(promptText);
  const responseType =
    bundle?.searchResponseConfig?.responseType === 'short'
      ? t('search.training.responseType.short')
      : t('search.training.responseType.long');
  const responseStyle =
    modelSettings && modelSettings.temperature <= 0.35
      ? t('search.training.responseType.detailed')
      : t('search.training.responseType.brief');
  const historyResultCount = historyMessageCount;
  const responseHelper =
    bundle?.searchResponseConfig?.responseType === 'short'
      ? t('search.training.responseType.briefHelp')
      : t('search.training.responseType.detailedHelp');
  const promptLines = isCompact ? 4 : 3;

  return (
    <StatePanel isEmpty={!overview} emptyLabel={t('search.training.overview.unavailable')}>
      {overview && modelSettings ? (
        <SearchConfigPanelCard
          icon={Bot}
          title={t('search.training.preview.title')}
          subtitle={t('search.training.preview.description')}>
          {isCompact ? (
            <View style={{ gap: spacing.sm }}>
              <PreviewCard
                heading={t('search.training.activeStatus.title')}
                colors={colors}
                spacing={spacing}
                typography={typography}
                overviewReady={overview.searchReady}
                t={t}
              />
              <PromptCard
                heading={t('search.training.prompt.title')}
                promptText={promptText}
                promptChars={promptChars}
                promptWords={promptWords}
                promptLines={promptLines}
                colors={colors}
                spacing={spacing}
                typography={typography}
                t={t}
              />
              <ResponseCard
                heading={t('search.training.responseType.title')}
                responseType={responseType}
                responseStyle={responseStyle}
                responseHelper={responseHelper}
                colors={colors}
                spacing={spacing}
                typography={typography}
              />
              <HistoryCard
                heading={t('search.training.searchHistory.title')}
                historyCount={historySessionCount}
                historyResultCount={historyResultCount}
                colors={colors}
                spacing={spacing}
                typography={typography}
                t={t}
              />
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <View style={[styles.desktopRow, { gap: spacing.sm }]}>
                <PreviewCard
                  heading={t('search.training.activeStatus.title')}
                  colors={colors}
                  spacing={spacing}
                  typography={typography}
                  overviewReady={overview.searchReady}
                  desktop
                  t={t}
                />
                <PromptCard
                  heading={t('search.training.prompt.title')}
                  promptText={promptText}
                  promptChars={promptChars}
                  promptWords={promptWords}
                  promptLines={promptLines}
                  colors={colors}
                  spacing={spacing}
                  typography={typography}
                  desktop
                  t={t}
                />
              </View>
              <View style={[styles.desktopRow, { gap: spacing.sm }]}>
                <ResponseCard
                  heading={t('search.training.responseType.title')}
                  responseType={responseType}
                  responseStyle={responseStyle}
                  responseHelper={responseHelper}
                  colors={colors}
                  spacing={spacing}
                  typography={typography}
                  desktop
                />
                <HistoryCard
                  heading={t('search.training.searchHistory.title')}
                  historyCount={historySessionCount}
                  historyResultCount={historyResultCount}
                  colors={colors}
                  spacing={spacing}
                  typography={typography}
                  desktop
                  t={t}
                />
              </View>
            </View>
          )}
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

type CardCommonProps = {
  desktop?: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  spacing: ReturnType<typeof useAppTheme>['spacing'];
  typography: ReturnType<typeof useAppTheme>['typography'];
  t?: ReturnType<typeof useTranslation>['t'];
};

function TileContainer({
  children,
  desktop,
  colors,
  spacing,
}: {
  children: React.ReactNode;
  desktop?: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  spacing: ReturnType<typeof useAppTheme>['spacing'];
}) {
  const { surfaceRadius } = useAppTheme();

  return (
    <View
      style={[
        styles.previewTile,
        desktop ? styles.desktopGridItem : null,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: surfaceRadius.card,
          padding: spacing.sm,
        },
      ]}>
      {children}
    </View>
  );
}

function PreviewCard({
  heading,
  overviewReady,
  desktop,
  colors,
  spacing,
  typography,
  t,
}: CardCommonProps & { heading: string; overviewReady: boolean }) {
  return (
    <TileContainer desktop={desktop} colors={colors} spacing={spacing}>
      <Text style={[typography.panelTileLabel, styles.tileTitle, { color: colors.textSoft }]}>{heading}</Text>
      <View style={styles.rowBetween}>
        <Text style={[typography.body, styles.primaryValue, { color: colors.text }]}>
          {overviewReady ? t!('search.training.activeStatus.active') : t!('search.training.activeStatus.inactive')}
        </Text>
        <StatusBadge
          label={
            overviewReady
              ? t!('search.training.activeStatus.enabled')
              : t!('search.training.activeStatus.disabled')
          }
          tone={overviewReady ? 'active' : 'inactive'}
          preserveCase
        />
      </View>
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 18 }]}>
        {t!('search.training.activeStatus.statusLabel')}{' '}
        {overviewReady ? t!('search.training.activeStatus.live') : t!('search.training.activeStatus.offline')}
      </Text>
    </TileContainer>
  );
}

function PromptCard({
  heading,
  promptText,
  promptChars,
  promptWords,
  promptLines,
  desktop,
  colors,
  spacing,
  typography,
  t,
}: CardCommonProps & {
  heading: string;
  promptText: string;
  promptChars: number;
  promptWords: number;
  promptLines: number;
}) {
  return (
    <TileContainer desktop={desktop} colors={colors} spacing={spacing}>
      <Text style={[typography.panelTileLabel, styles.tileTitle, { color: colors.textSoft }]}>{heading}</Text>
      <Text style={[typography.caption, styles.promptBody, { color: colors.text, marginTop: 2, lineHeight: 20, fontWeight: '400' }]} numberOfLines={promptLines}>
        {promptText.trim() || t!('search.training.prompt.empty')}
      </Text>
      <View style={[styles.rowBetween, { marginTop: spacing.xs }]}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t!('search.training.prompt.length')}</Text>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
          {t!('search.training.prompt.chars', { count: promptChars })}
        </Text>
      </View>
      <View style={[styles.rowBetween, { marginTop: 2 }]}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t!('search.training.prompt.words')}</Text>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{promptWords}</Text>
      </View>
    </TileContainer>
  );
}

function ResponseCard({
  heading,
  responseType,
  responseStyle,
  responseHelper,
  desktop,
  colors,
  spacing,
  typography,
}: CardCommonProps & {
  heading: string;
  responseType: string;
  responseStyle: string;
  responseHelper: string;
}) {
  const { surfaceRadius } = useAppTheme();

  return (
    <TileContainer desktop={desktop} colors={colors} spacing={spacing}>
      <Text style={[typography.panelTileLabel, styles.tileTitle, { color: colors.textSoft }]}>{heading}</Text>
      <View style={styles.rowBetween}>
        <Text style={[typography.body, styles.primaryValue, { color: colors.text }]}>{responseType}</Text>
        <View style={[styles.styleBadge, { borderRadius: surfaceRadius.button, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{responseStyle}</Text>
        </View>
      </View>
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 18 }]}>
        {responseHelper}
      </Text>
    </TileContainer>
  );
}

function HistoryCard({
  heading,
  historyCount,
  historyResultCount,
  desktop,
  colors,
  spacing,
  typography,
  t,
}: CardCommonProps & { heading: string; historyCount: number; historyResultCount: number }) {
  const { surfaceRadius } = useAppTheme();

  return (
    <TileContainer desktop={desktop} colors={colors} spacing={spacing}>
      <Text style={[typography.panelTileLabel, styles.tileTitle, { color: colors.textSoft }]}>{heading}</Text>
      <View style={styles.rowBetween}>
        <Text style={[typography.body, styles.primaryValue, { color: colors.text }]}>
          {t!('search.training.searchHistory.conversations', { count: historyCount })}
        </Text>
        <View style={[styles.styleBadge, { borderRadius: surfaceRadius.button, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
            {t!('search.training.searchHistory.total', { count: historyResultCount })}
          </Text>
        </View>
      </View>
      <View style={[styles.rowBetween, { marginTop: spacing.xs }]}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t!('search.training.searchHistory.totalMessages')}
        </Text>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{historyResultCount}</Text>
      </View>
    </TileContainer>
  );
}

const styles = StyleSheet.create({
  desktopRow: { flexDirection: 'row', alignItems: 'stretch', width: '100%' },
  desktopGridItem: { flex: 1, minWidth: 0 },
  previewTile: {
    minHeight: 98,
    borderWidth: 1,
    gap: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 8,
  },
  styleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  primaryValue: { fontWeight: '500', lineHeight: 24, flexShrink: 1 },
  tileTitle: { marginBottom: 2 },
  promptBody: { flexShrink: 1 },
});
