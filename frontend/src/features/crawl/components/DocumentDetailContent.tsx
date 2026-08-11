import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import { EmbeddingCoverageWarningIcon } from '@/features/crawl/components/EmbeddingCoverageWarningIcon';
import { EmbeddingModelsDetail } from '@/features/crawl/components/EmbeddingModelsDetail';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import {
  formatDocumentIndexedDate,
  formatDocumentMimeBadge,
  resolveDocumentStatusLabel,
} from '@/features/crawl/utils/document-form';
import type { EmbeddingItemCoverage, ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: CrawlDocument;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingCoverage?: EmbeddingItemCoverage | null;
};

function DetailField({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.text, marginTop: 4 }]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function DocumentDetailContent({ document, coverageEntry, embeddingCoverage }: Props) {
  const { spacing, colors, typography } = useAppTheme();
  const { t } = useTranslation();
  const displayTitle = document.title?.trim() || document.name;
  const statusTone =
    document.status === 'failed' ? 'danger' : document.status === 'indexed' ? 'default' : 'muted';

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.subtitle, styles.fileName, { color: colors.text, flex: 1 }]} numberOfLines={3}>
          {displayTitle}
        </Text>
        <View style={styles.badges}>
          <CrawlStatusBadge label={formatDocumentMimeBadge(document.mimeType)} tone="fileType" preserveCase />
          <CrawlStatusBadge
            label={resolveDocumentStatusLabel(document, coverageEntry)}
            tone={statusTone}
          />
          <EmbeddingCoverageWarningIcon entry={coverageEntry} />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <DetailField label={t('documents.details.sourceDomain')} value={document.sourceLabel} />
        <DetailField label={t('documents.details.language')} value={document.language} />
        <DetailField label={t('documents.details.fileSize')} value={`${document.sizeKb} KB`} />
        <DetailField label={t('documents.details.checksum')} value={document.checksum} />
        <DetailField
          label={t('documents.details.chunks')}
          value={t('documents.details.chunksCreated', { count: document.chunksCount })}
        />
        <DetailField label={t('documents.details.lastIndexed')} value={formatDocumentIndexedDate(document.indexedAt)} />
        <EmbeddingModelsDetail
          entry={coverageEntry}
          activeProvider={embeddingCoverage?.active_provider}
          activeModel={embeddingCoverage?.active_model}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fileName: {
    fontSize: 16,
    lineHeight: 22,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  field: {
    gap: 0,
  },
});
