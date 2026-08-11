import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { FileText, Layers } from 'lucide-react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import {
  buildDocumentContentStreamUrl,
  fetchDocumentChunks,
  fetchDocumentContentBlob,
  fetchDocumentTextContent,
  type DocumentChunk,
} from '@/features/crawl/services/crawl.service';
import { openDocumentPreview } from '@/features/crawl/utils/document-preview';
import {
  convertDocxBufferToHtml,
  isDocxDocument,
  isHtmlMimeType,
} from '@/features/crawl/utils/document-docx-utils';
import { isPptxDocument } from '@/features/crawl/utils/document-pptx-utils';
import { PptxPreviewPanel } from '@/features/crawl/components/PptxPreviewPanel';
import {
  formatDocumentMimeBadge,
  formatDocumentChunkLabel,
} from '@/features/crawl/utils/document-form';
import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { AppButton } from '@/shared/components/app-button';
import { AppHtmlBody } from '@/shared/components/app-html-body';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const CHUNK_PAGE_SIZE = 30;

type InspectorTab = 'content' | 'chunks';

type Props = {
  visible: boolean;
  document: CrawlDocument | null;
  onClose: () => void;
};

function isPdfDocument(document: CrawlDocument): boolean {
  const mime = document.mimeType.toLowerCase();
  const name = (document.title ?? document.name).toLowerCase();
  return mime.includes('pdf') || name.endsWith('.pdf');
}

function isTextDocument(document: CrawlDocument): boolean {
  const mime = document.mimeType.toLowerCase().trim();
  const name = (document.title ?? document.name).toLowerCase();
  const source = (document.sourceLabel ?? '').toLowerCase();
  return (
    mime.startsWith('text/') ||
    mime === 'txt' ||
    mime === 'text' ||
    mime === 'md' ||
    mime === 'markdown' ||
    mime === 'html' ||
    mime === 'htm' ||
    mime === 'json' ||
    mime === 'csv' ||
    mime === 'application/json' ||
    mime.includes('markdown') ||
    mime.includes('html') ||
    name.endsWith('.md') ||
    name.endsWith('.txt') ||
    name.endsWith('.html') ||
    name.endsWith('.htm') ||
    name.endsWith('.csv') ||
    source === 'gmail' ||
    name.startsWith('[gmail]')
  );
}

export function DocumentInspectorSheet({ visible, document, onClose }: Props) {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<InspectorTab>('content');
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [contentText, setContentText] = useState<string | null>(null);
  const [contentHtml, setContentHtml] = useState<string | null>(null);
  const [pptxBuffer, setPptxBuffer] = useState<ArrayBuffer | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [chunksTotal, setChunksTotal] = useState<number | null>(null);
  const [chunksHasMore, setChunksHasMore] = useState(false);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksLoadingMore, setChunksLoadingMore] = useState(false);
  const [chunkOffset, setChunkOffset] = useState(0);
  const contentLoadedRef = useRef(false);

  const resetState = useCallback(() => {
    setActiveTab('content');
    setStreamUrl((prev) => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setContentText(null);
    setContentHtml(null);
    setPptxBuffer(null);
    setContentLoading(false);
    setContentError(null);
    setChunks([]);
    setChunksTotal(null);
    setChunksHasMore(false);
    setChunksLoading(false);
    setChunksLoadingMore(false);
    setChunkOffset(0);
    contentLoadedRef.current = false;
  }, []);

  const loadContent = useCallback(async () => {
    if (!document || contentLoadedRef.current) return;
    contentLoadedRef.current = true;
    setContentLoading(true);
    setContentError(null);
    try {
      if (isPdfDocument(document) && Platform.OS === 'web') {
        try {
          // Prefer authenticated blob → object URL (works across API/frontend origins).
          const { data, mimeType } = await fetchDocumentContentBlob(document.id);
          const blob = new Blob([data], { type: mimeType || 'application/pdf' });
          const objectUrl = URL.createObjectURL(blob);
          setStreamUrl(objectUrl);
          return;
        } catch {
          const url = await buildDocumentContentStreamUrl(document.id);
          setStreamUrl(url);
          return;
        }
      }

      const needsBlob = isDocxDocument(document) || isPptxDocument(document);
      if (needsBlob) {
        const { data, mimeType } = await fetchDocumentContentBlob(document.id);
        if (isDocxDocument(document, mimeType)) {
          const html = await convertDocxBufferToHtml(data);
          setContentHtml(html);
          return;
        }
        if (isPptxDocument(document, mimeType) && Platform.OS === 'web') {
          setPptxBuffer(data);
          return;
        }
      }

      if (isTextDocument(document)) {
        const text = await fetchDocumentTextContent(document.id);
        if (isHtmlMimeType(document.mimeType) || isHtmlMimeType(text.slice(0, 64))) {
          setContentHtml(text);
        } else {
          setContentText(text);
        }
        return;
      }

      // Office / binary types without inline renderer — still try stream / external.
      try {
        const url = await buildDocumentContentStreamUrl(document.id);
        if (Platform.OS === 'web') {
          setStreamUrl(url);
          return;
        }
      } catch {
        // Fall through.
      }

      setContentError(t('documents.inspector.previewInlineUnavailable'));
    } catch {
      setContentError(t('documents.inspector.loadFailed'));
      contentLoadedRef.current = false;
    } finally {
      setContentLoading(false);
    }
  }, [document, t]);

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
    void loadContent();
    void loadChunks();
  }, [visible, document?.id, loadContent, loadChunks, resetState]);

  const handleTabChange = useCallback(
    (tab: InspectorTab) => {
      setActiveTab(tab);
      if (
        tab === 'content' &&
        !streamUrl &&
        !contentText &&
        !contentHtml &&
        !pptxBuffer &&
        !contentLoading &&
        !contentError
      ) {
        void loadContent();
      }
    },
    [contentError, contentHtml, contentLoading, contentText, loadContent, pptxBuffer, streamUrl],
  );

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
          <ConfigurationOutlineButton
            label={t('documents.inspector.openExternal')}
            onPress={() => void openDocumentPreview(document, t)}
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
          onChange={handleTabChange}
          variant="secondary"
        />

        {activeTab === 'content' ? (
          <View style={[styles.panel, { borderColor: colors.border, borderRadius: panelRadius }]}>
            {contentLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('documents.inspector.loading')}</Text>
              </View>
            ) : null}
            {contentError && !contentLoading ? (
              <View style={[styles.centered, { gap: spacing.sm, padding: spacing.md }]}>
                <Text style={[typography.body, { color: colors.danger, textAlign: 'center' }]}>{contentError}</Text>
                <ConfigurationOutlineButton
                  label={t('common.retry')}
                  onPress={() => {
                    contentLoadedRef.current = false;
                    void loadContent();
                  }}
                />
              </View>
            ) : null}
            {contentText ? (
              <AppScrollView style={styles.textScroll} contentContainerStyle={{ padding: spacing.md }}>
                <Text style={[styles.mono, { color: colors.text, fontFamily: fonts.mono }]} selectable>
                  {contentText}
                </Text>
              </AppScrollView>
            ) : null}
            {contentHtml ? (
              <AppScrollView style={styles.textScroll} contentContainerStyle={{ padding: spacing.md }}>
                <AppHtmlBody html={contentHtml} />
              </AppScrollView>
            ) : null}
            {pptxBuffer && Platform.OS === 'web' ? (
              <AppScrollView style={styles.textScroll} contentContainerStyle={{ padding: spacing.sm }}>
                <PptxPreviewPanel
                  arrayBuffer={pptxBuffer}
                  onError={() => {
                    setPptxBuffer(null);
                    setContentError(t('documents.inspector.previewInlineUnavailable'));
                  }}
                />
              </AppScrollView>
            ) : null}
            {streamUrl && Platform.OS === 'web' ? (
              <View style={styles.pdfFrame}>
                {/* eslint-disable-next-line react/no-unknown-property */}
                <iframe
                  src={streamUrl}
                  title={displayTitle}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: panelRadius }}
                />
              </View>
            ) : null}
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
  textScroll: {
    maxHeight: 480,
  },
  mono: {
    fontSize: 13,
    lineHeight: 20,
  },
  pdfFrame: {
    height: 480,
    width: '100%',
  },
  chunkCard: {
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
});
