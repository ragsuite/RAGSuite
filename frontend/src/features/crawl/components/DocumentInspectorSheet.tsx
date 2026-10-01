import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { FileText, Layers } from 'lucide-react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import { DocumentPreviewPane } from '@/features/crawl/components/DocumentPreviewPane';
import { useDocumentFileActions } from '@/features/crawl/hooks/use-document-file-actions';
import { useDocumentPreviewContent } from '@/features/crawl/hooks/use-document-preview-content';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { fetchDocumentChunks, type DocumentChunk } from '@/features/crawl/services/crawl.service';
import {
  formatDocumentMimeBadge,
  formatDocumentChunkLabel,
} from '@/features/crawl/utils/document-form';
import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { AppButton } from '@/shared/components/app-button';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const CHUNK_PAGE_SIZE = 30;

type InspectorTab = 'content' | 'chunks';

type Props = {
  visible: boolean;
  document: CrawlDocument | null;
  onClose: () => void;
};

export function DocumentInspectorSheet({ visible, document, onClose }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<InspectorTab>('content');
  const preview = useDocumentPreviewContent(document);
  const fileActions = useDocumentFileActions(document);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [chunksTotal, setChunksTotal] = useState<number | null>(null);
  const [chunksHasMore, setChunksHasMore] = useState(false);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksLoadingMore, setChunksLoadingMore] = useState(false);
  const [chunkOffset, setChunkOffset] = useState(0);
  const { load: loadPreview, reset: resetPreview } = preview;

  const resetState = useCallback(() => {
    setActiveTab('content');
    resetPreview();
    setChunks([]);
    setChunksTotal(null);
    setChunksHasMore(false);
    setChunksLoading(false);
    setChunksLoadingMore(false);
    setChunkOffset(0);
  }, [resetPreview]);

  const loadChunks = useCallback(async () => {
    if (!document) return;
    setChunksLoading(true);
    try {
      const page = await fetchDocumentChunks(document.id, CHUNK_PAGE_SIZE, 0);
      setChunks(page.chunks);
      setChunksTotal(page.total);
      setChunksHasMore(page.has_more);
      setChunkOffset(CHUNK_PAGE_SIZE);
    } catch {
      setChunks([]);
      setChunksTotal(null);
      setChunksHasMore(false);
    } finally {
      setChunksLoading(false);
    }
  }, [document]);

  const loadMoreChunks = useCallback(async () => {
    if (!document || chunksLoadingMore || !chunksHasMore) return;
    setChunksLoadingMore(true);
    try {
      const page = await fetchDocumentChunks(document.id, CHUNK_PAGE_SIZE, chunkOffset);
      setChunks((current) => [...current, ...page.chunks]);
      setChunksHasMore(page.has_more);
      setChunkOffset((current) => current + CHUNK_PAGE_SIZE);
    } catch {
      // Best-effort pagination.
    } finally {
      setChunksLoadingMore(false);
    }
  }, [chunkOffset, chunksHasMore, chunksLoadingMore, document]);

  useEffect(() => {
    if (!visible) {
      resetState();
      return;
    }
    if (!document) return;
    void loadPreview();
    void loadChunks();
    // Reload only when a different document opens (the document object refreshes during polling).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, document?.id]);

  if (!document) return null;

  const displayTitle = document.title?.trim() || document.name;
  const chunkCount = chunksTotal ?? document.chunksCount;

  return (
    <CrawlSheet
      visible={visible}
      title={displayTitle}
      subtitle={t('documents.inspector.subtitle')}
      size="sideSheetXl"
      onClose={onClose}
      footer={
        <View style={[styles.footer, { gap: spacing.xs }]}>
          {fileActions.canOpen ? (
            <ConfigurationOutlineButton
              label={t('documents.inspector.openInNewTab')}
              icon={ActionIcons.externalLink}
              loading={fileActions.opening}
              onPress={() => void fileActions.open()}
            />
          ) : null}
          <ConfigurationOutlineButton
            label={t('documents.inspector.download')}
            icon={ActionIcons.download}
            loading={fileActions.downloading}
            onPress={() => void fileActions.download()}
          />
        </View>
      }>
      <View style={{ gap: spacing.md }}>
        <View style={styles.metaRow}>
          <CrawlStatusBadge label={formatDocumentMimeBadge(document.mimeType)} tone="fileType" preserveCase />
          <View style={styles.metaItem}>
            <Layers size={14} color={colors.textMuted} />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {formatDocumentChunkLabel(chunkCount)}
            </Text>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{document.sizeKb} KB</Text>
        </View>

        <CrawlSegmentTabs
          tabs={[
            { key: 'content', label: t('documents.inspector.tabContent'), icon: FileText },
            { key: 'chunks', label: t('documents.inspector.tabChunksCount', { count: chunkCount }), icon: Layers },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
          variant="secondary"
        />

        {activeTab === 'content' ? (
          <View style={[styles.panel, { borderColor: colors.border, borderRadius: panelRadius }]}>
            <DocumentPreviewPane
              content={preview.content}
              title={displayTitle}
              downloading={fileActions.downloading}
              onRetry={() => void loadPreview()}
              onDownload={() => void fileActions.download()}
              onPptxError={preview.fallbackToServerPreview}
            />
          </View>
        ) : (
          <View style={[styles.panel, { borderColor: colors.border, borderRadius: panelRadius }]}>
            {chunksLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : chunks.length === 0 ? (
              <View style={styles.centered}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('documents.inspector.noChunksIndexed')}</Text>
              </View>
            ) : (
              <AppScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
                {chunks.map((chunk, index) => (
                  <View
                    key={`chunk-${index}-${chunk.chunk_index}`}
                    style={[styles.chunkCard, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, borderRadius: panelRadius }]}>
                    <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
                      {t('documents.inspector.chunkLabel', { index: chunk.chunk_index + 1 })}
                    </Text>
                    <Text style={[typography.body, { color: colors.text, lineHeight: 20 }]} selectable>
                      {chunk.text}
                    </Text>
                  </View>
                ))}
                {chunksHasMore ? (
                  <AppButton
                    label={
                      chunksLoadingMore
                        ? t('common.loading')
                        : t('documents.inspector.loadMore', { loaded: chunks.length, total: chunkCount })
                    }
                    size="compact"
                    loading={chunksLoadingMore}
                    onPress={() => void loadMoreChunks()}
                  />
                ) : null}
              </AppScrollView>
            )}
          </View>
        )}
      </View>
    </CrawlSheet>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  panel: {
    borderWidth: 1,
    minHeight: 280,
    maxHeight: 520,
    overflow: 'hidden',
  },
  centered: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  chunkCard: {
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
});
