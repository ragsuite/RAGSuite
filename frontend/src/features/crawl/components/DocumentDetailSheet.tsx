import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { Eye, FileText } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import { DocumentDetailContent } from '@/features/crawl/components/DocumentDetailContent';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import type { EmbeddingItemCoverage, ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  visible: boolean;
  document: CrawlDocument | null;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingCoverage?: EmbeddingItemCoverage | null;
  saving: boolean;
  onClose: () => void;
  onInspect: () => void;
  onReindex: () => void;
  onDelete: () => void;
};

export function DocumentDetailSheet({
  visible,
  document,
  coverageEntry,
  embeddingCoverage,
  saving,
  onClose,
  onInspect,
  onReindex,
  onDelete,
}: Props) {
  const { spacing } = useAppTheme();
  const { t } = useTranslation();
  if (!document) return null;

  return (
    <CrawlSheet
      visible={visible}
      presentation="sideSheet"
      size="sideSheetSm"
      title={t('documents.details.title')}
      subtitle={t('documents.details.description')}
      titleIcon={FileText}
      onClose={onClose}
      footer={
        <View style={[styles.footer, { gap: spacing.xs }]}>
          <ConfigurationOutlineButton
            label={t('documents.inspector.open')}
            icon={Eye}
            onPress={onInspect}
          />
          <ConfigurationOutlineButton
            label={t('documents.bulk.reindex')}
            icon={ActionIcons.refresh}
            loading={saving}
            onPress={onReindex}
          />
          <ConfigurationOutlineButton
            label={t('common.delete')}
            icon={ActionIcons.delete}
            onPress={onDelete}
          />
        </View>
      }>
      <DocumentDetailContent
        document={document}
        coverageEntry={coverageEntry}
        embeddingCoverage={embeddingCoverage}
      />
    </CrawlSheet>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
});
