import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Globe } from 'lucide-react-native';

import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import { JobDetailContent } from '@/features/crawl/components/JobDetailContent';
import type { CrawlJob, CrawlSource } from '@/features/crawl/types/crawl.types';
import type { EmbeddingItemCoverage, ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { useTranslation } from '@/i18n';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type JobDetailProps = {
  visible: boolean;
  source: CrawlSource | null;
  job: CrawlJob | null;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingCoverage?: EmbeddingItemCoverage | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
};

export function CrawlJobDetailSheet({
  visible,
  source,
  job,
  coverageEntry,
  embeddingCoverage,
  loading = false,
  error = null,
  onClose,
}: JobDetailProps) {
  const { spacing, typography, colors, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  if (!visible || !source) return null;

  const hasJob = Boolean(source.latest_job_id ?? source.active_job_id);

  return (
    <CrawlSheet
      visible={visible}
      presentation="sideSheet"
      size="sideSheetMd"
      title={source.name}
      subtitle={source.base_url}
      titleIcon={Globe}
      onClose={onClose}>
      {!hasJob ? (
        <View style={[styles.errorBox, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card, padding: spacing.sm }]}>
          <AlertCircle size={16} color={colors.textMuted} />
          <Text style={[typography.body, { color: colors.textMuted, flex: 1 }]}>
            {t('crawl.jobs.detail.noJob')}
          </Text>
        </View>
      ) : error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card, padding: spacing.sm }]}>
          <AlertCircle size={16} color={colors.textMuted} />
          <Text style={[typography.body, { color: colors.textMuted, flex: 1 }]}>{error}</Text>
        </View>
      ) : loading || !job ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('crawl.table.loading')}</Text>
        </View>
      ) : (
        <JobDetailContent job={job} coverageEntry={coverageEntry} embeddingCoverage={embeddingCoverage} />
      )}
    </CrawlSheet>
  );
}

export function ConfirmDeleteSheet({
  visible,
  title,
  message,
  saving,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();

  return (
    <CrawlSheet
      visible={visible}
      title={title}
      subtitle={message}
      size="confirm"
      onClose={onClose}
      footerBordered
      footer={
        <OverlayDialogFooter
          cancelLabel={t('common.cancel')}
          primaryLabel={t('common.delete')}
          onCancel={onClose}
          onPrimary={onConfirm}
          primaryLoading={saving}
          primaryDisabled={saving}
          cancelDisabled={saving}
          primaryVariant="danger"
        />
      }>
      <View />
    </CrawlSheet>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  deleteBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
