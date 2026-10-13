import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Clock } from 'lucide-react-native';

import { CrawlSourceProgressBar } from '@/features/crawl/components/CrawlSourceProgressBar';
import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import { CrawlEmbeddingCoverageWarningIcon } from '@/features/crawl/components/CrawlEmbeddingCoverageWarningIcon';
import { ModelLabelStack, SourceMenuButton } from '@/features/crawl/components/CrawlSourceRowParts';
import type { CrawlSourceRowViewProps } from '@/features/crawl/components/crawl-source-row.types';
import { formatRelativeTime, formatShortDate } from '@/features/crawl/utils/crawl.utils';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function CrawlSourceCardRow({
  source,
  coverageEntry,
  embeddingOptions,
  modelLabels,
  trained,
  statusLabel,
  statusTone,
  showProgress,
  progressValue,
  showCoverageWarning,
  answersSwitch,
  onOpenMenu,
  onPress,
}: CrawlSourceRowViewProps) {
  const { t, locale } = useTranslation();
  const { colors, spacing, surfaceRadius, componentRadius, typography } = useAppTheme();
  const muted = [typography.caption, { color: colors.textMuted }];

  const content = (
    <View style={styles.body}>
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={[typography.body, styles.grow, { color: colors.text, lineHeight: 20 }]} numberOfLines={1}>
              {source.name || t('crawl.table.unnamed')}
            </Text>
            {showCoverageWarning ? (
              <CrawlEmbeddingCoverageWarningIcon source={source} entry={coverageEntry} embeddingOptions={embeddingOptions} />
            ) : null}
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 16 }]} numberOfLines={1}>
            {source.base_url || t('crawl.table.noUrl')}
          </Text>
        </View>
        <CrawlStatusBadge label={statusLabel} tone={statusTone} preserveCase />
      </View>

      {showProgress ? <CrawlSourceProgressBar value={progressValue} layout="card" /> : null}

      <View style={styles.metaRow}>
        <Text style={muted} numberOfLines={1}>
          {t('crawl.table.mobileMeta', {
            depth: source.depth,
            schedule: source.cadence,
            waitForLoad: source.headless_mode || 'AUTO',
          })}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <View style={styles.trainedRow}>
          {trained ? <CheckCircle2 size={13} color={colors.success} /> : <Clock size={13} color={colors.warning} />}
          <Text style={[typography.caption, { color: trained ? colors.success : colors.textMuted, fontWeight: '500' }]}>
            {trained
              ? `${t('crawl.table.training.trained')} ${formatShortDate(source.trained_at, locale)}`
              : t('crawl.table.training.pending')}
          </Text>
        </View>
        <Text style={muted}>·</Text>
        <Text style={[...muted, styles.shrink]} numberOfLines={1}>
          {formatRelativeTime(source.last_crawl_at, t)}
        </Text>
        <Text style={muted}>·</Text>
        <View style={styles.modelStack}>
          <ModelLabelStack labels={modelLabels} trained={trained} />
        </View>
        <Text style={muted}>·</Text>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
          {source.documents_count} links
        </Text>
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          borderRadius: componentRadius.card,
          backgroundColor: colors.surface,
          paddingLeft: spacing.sm,
          paddingRight: spacing.xs,
        },
      ]}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${source.name}, ${statusLabel}`}
          accessibilityHint="Opens source details to edit"
          onPress={onPress}
          style={({ pressed }) => [
            styles.main,
            { backgroundColor: pressed ? colors.surfaceMuted : 'transparent', borderRadius: surfaceRadius.card },
          ]}>
          {content}
        </Pressable>
      ) : (
        <View style={styles.main}>{content}</View>
      )}
      {answersSwitch ? <View style={styles.answers}>{answersSwitch}</View> : null}
      <SourceMenuButton
        sourceName={source.name}
        size={{ width: 32, height: 32 }}
        radius={surfaceRadius.button}
        onOpenMenu={onOpenMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  grow: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  trainedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  modelStack: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  answers: {
    flexShrink: 0,
    minHeight: 32,
    justifyContent: 'center',
  },
});
