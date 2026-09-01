import React, { useMemo } from 'react';
import { Eye, FileText } from 'lucide-react-native';
import { AddSourceSheet } from '@/features/crawl/components/AddSourceSheet';
import { CrawlActionMenu, sourceMenuItems } from '@/features/crawl/components/CrawlActionMenu';
import { ConfirmDeleteSheet, CrawlJobDetailSheet } from '@/features/crawl/components/CrawlOverlays';
import { DocumentDetailSheet } from '@/features/crawl/components/DocumentDetailSheet';
import { DocumentFormSheet } from '@/features/crawl/components/DocumentFormSheet';
import { DocumentInspectorSheet } from '@/features/crawl/components/DocumentInspectorSheet';
import { useCrawlManagement } from '@/features/crawl/hooks/useCrawlManagement';
import { canStartCrawlForSite, sourceHasActiveCrawlJob } from '@/features/crawl/utils/crawl-pipeline-status';
import { buildCoverageByCrawlSourceId, buildCoverageByDocumentId } from '@/features/crawl/utils/document-api-mappers';
import { useTranslation } from '@/i18n';
import { ActionIcons } from '@/shared/constants/action-icons';

export function CrawlOverlayHost() {
  const { t } = useTranslation();
  const {
    bundle,
    saving,
    isUploadingDocuments,
    documentUploadProgress,
    embeddingCoverage,
    embeddingTargetOptions,
    jobDetailLoading,
    jobDetailSnapshot,
    jobDetailError,
    activeSheet,
    actionMenu,
    closeSheet,
    closeActionMenu,
    openSheet,
    setDomainSubTab,
    selectedDocumentIds,
    handleSubmitSource,
    handleUploadDocument,
    handleUpdateDocument,
    handleRunSource,
    handleDeleteSource,
    handleDeleteDocument,
    handleBulkDeleteDocuments,
    handleViewDocument,
    handleInspectDocument,
    handleEditDocument,
    handleOpenDocument,
    handleReindexDocument,
  } = useCrawlManagement();

  const editingSource = useMemo(() => {
    if (activeSheet?.type !== 'edit-source') return null;
    return bundle?.sources.find((source) => source.id === activeSheet.sourceId) ?? null;
  }, [activeSheet, bundle?.sources]);

  const editingSourceCoverage = useMemo(() => {
    if (!editingSource) return null;
    return buildCoverageByCrawlSourceId(embeddingCoverage).get(editingSource.id) ?? null;
  }, [editingSource, embeddingCoverage]);

  const selectedJobSource = useMemo(() => {
    if (activeSheet?.type !== 'job-detail') return null;
    return bundle?.sources.find((source) => source.id === activeSheet.sourceId) ?? null;
  }, [activeSheet, bundle?.sources]);

  const selectedJob = jobDetailSnapshot;

  const selectedJobCoverage = useMemo(() => {
    if (!selectedJobSource) return null;
    return buildCoverageByCrawlSourceId(embeddingCoverage).get(selectedJobSource.id) ?? null;
  }, [embeddingCoverage, selectedJobSource]);

  const editingDocument = useMemo(() => {
    if (activeSheet?.type !== 'edit-document') return null;
    return bundle?.documents.find((doc) => doc.id === activeSheet.documentId) ?? null;
  }, [activeSheet, bundle?.documents]);

  const detailDocument = useMemo(() => {
    if (activeSheet?.type !== 'document-detail') return null;
    return bundle?.documents.find((doc) => doc.id === activeSheet.documentId) ?? null;
  }, [activeSheet, bundle?.documents]);

  const detailDocumentCoverage = useMemo(() => {
    if (!detailDocument) return null;
    return buildCoverageByDocumentId(embeddingCoverage).get(detailDocument.id) ?? null;
  }, [embeddingCoverage, detailDocument]);

  const inspectorDocument = useMemo(() => {
    if (activeSheet?.type !== 'document-inspector') return null;
    return bundle?.documents.find((doc) => doc.id === activeSheet.documentId) ?? null;
  }, [activeSheet, bundle?.documents]);

  const menuSource = useMemo(() => {
    if (actionMenu?.kind !== 'source') return null;
    return bundle?.sources.find((source) => source.id === actionMenu.sourceId) ?? null;
  }, [actionMenu, bundle?.sources]);

  const menuDocument = useMemo(() => {
    if (actionMenu?.kind !== 'document') return null;
    return bundle?.documents.find((doc) => doc.id === actionMenu.documentId) ?? null;
  }, [actionMenu, bundle?.documents]);

  const deleteSource = bundle?.sources.find(
    (source) => activeSheet?.type === 'confirm-delete-source' && source.id === activeSheet.sourceId
  );
  const deleteDocumentItem = bundle?.documents.find(
    (doc) => activeSheet?.type === 'confirm-delete-document' && doc.id === activeSheet.documentId
  );

  return (
    <>
      <AddSourceSheet
        visible={activeSheet?.type === 'add-source' || activeSheet?.type === 'edit-source'}
        mode={activeSheet?.type === 'edit-source' ? 'edit' : 'add'}
        source={editingSource}
        coverageEntry={editingSourceCoverage}
        saving={saving}
        onClose={closeSheet}
        onSubmit={(payload) => void handleSubmitSource(payload)}
      />

      <DocumentFormSheet
        visible={activeSheet?.type === 'upload-document'}
        mode="upload"
        saving={saving || isUploadingDocuments}
        uploadProgress={documentUploadProgress}
        onClose={closeSheet}
        onSubmit={(payload) => void handleUploadDocument(payload)}
      />

      <DocumentFormSheet
        visible={activeSheet?.type === 'edit-document'}
        mode="edit"
        document={editingDocument}
        saving={saving}
        onClose={closeSheet}
        onSubmit={(payload) => void handleUpdateDocument(payload)}
      />

      <DocumentDetailSheet
        visible={activeSheet?.type === 'document-detail'}
        document={detailDocument}
        coverageEntry={detailDocumentCoverage}
        embeddingCoverage={embeddingCoverage}
        saving={saving}
        onClose={closeSheet}
        onInspect={() => {
          if (!detailDocument) return;
          closeSheet();
          handleInspectDocument(detailDocument.id);
        }}
        onReindex={() => detailDocument && void handleReindexDocument(detailDocument.id)}
        onDelete={() => detailDocument && openSheet({ type: 'confirm-delete-document', documentId: detailDocument.id })}
      />

      <DocumentInspectorSheet
        visible={activeSheet?.type === 'document-inspector'}
        document={inspectorDocument}
        onClose={closeSheet}
      />

      <CrawlJobDetailSheet
        visible={activeSheet?.type === 'job-detail'}
        source={selectedJobSource}
        job={selectedJob}
        coverageEntry={selectedJobCoverage}
        embeddingCoverage={embeddingCoverage}
        embeddingOptions={embeddingTargetOptions}
        loading={jobDetailLoading}
        error={jobDetailError}
        onClose={closeSheet}
      />

      <ConfirmDeleteSheet
        visible={activeSheet?.type === 'confirm-bulk-delete-documents'}
        title={t('crawl.confirm.deleteDocuments.title')}
        message={
          selectedDocumentIds.length === 1
            ? t('crawl.confirm.deleteDocuments.messageOne')
            : t('crawl.confirm.deleteDocuments.messageMany', { count: selectedDocumentIds.length })
        }
        saving={saving}
        onClose={closeSheet}
        onConfirm={() => void handleBulkDeleteDocuments(selectedDocumentIds)}
      />

      <ConfirmDeleteSheet
        visible={activeSheet?.type === 'confirm-delete-source'}
        title={t('crawl.confirm.deleteSource.title')}
        message={
          deleteSource
            ? t('crawl.confirm.deleteSource.message', { name: deleteSource.name })
            : t('crawl.confirm.deleteSource.messageFallback')
        }
        saving={saving}
        onClose={closeSheet}
        onConfirm={() => activeSheet?.type === 'confirm-delete-source' && void handleDeleteSource(activeSheet.sourceId)}
      />

      <ConfirmDeleteSheet
        visible={activeSheet?.type === 'confirm-delete-document'}
        title={t('crawl.confirm.deleteDocument.title')}
        message={
          deleteDocumentItem
            ? t('crawl.confirm.deleteDocument.message', { name: deleteDocumentItem.name })
            : t('crawl.confirm.deleteDocument.messageFallback')
        }
        saving={saving}
        onClose={closeSheet}
        onConfirm={() =>
          activeSheet?.type === 'confirm-delete-document' && void handleDeleteDocument(activeSheet.documentId)
        }
      />

      <CrawlActionMenu
        visible={actionMenu?.kind === 'source' && Boolean(menuSource)}
        title={menuSource?.name ?? t('crawl.action.sourceActions')}
        anchor={actionMenu?.kind === 'source' ? actionMenu.anchor : undefined}
        onClose={closeActionMenu}
        items={
          menuSource
            ? sourceMenuItems(t, {
                canStartCrawl: canStartCrawlForSite(menuSource),
                startDisabledReason: sourceHasActiveCrawlJob(menuSource)
                  ? t('crawl.table.tooltip.alreadyRunning')
                  : undefined,
                onRun: () => void handleRunSource(menuSource.id),
                onEdit: () => openSheet({ type: 'edit-source', sourceId: menuSource.id }),
                onDelete: () => openSheet({ type: 'confirm-delete-source', sourceId: menuSource.id }),
              })
            : []
        }
      />

      <CrawlActionMenu
        visible={actionMenu?.kind === 'document' && Boolean(menuDocument)}
        title={menuDocument?.name ?? t('crawl.action.documentActions')}
        onClose={closeActionMenu}
        items={
          menuDocument
            ? [
                {
                  key: 'inspect',
                  label: t('crawl.action.inspectDocument'),
                  icon: Eye,
                  onPress: () => handleInspectDocument(menuDocument.id),
                },
                {
                  key: 'view',
                  label: t('crawl.action.viewDocument'),
                  icon: FileText,
                  onPress: () => handleViewDocument(menuDocument.id),
                },
                {
                  key: 'edit',
                  label: t('crawl.action.editDocument'),
                  icon: ActionIcons.edit,
                  onPress: () => handleEditDocument(menuDocument.id),
                },
                {
                  key: 'delete',
                  label: t('crawl.action.deleteDocument'),
                  icon: ActionIcons.delete,
                  tone: 'danger',
                  onPress: () => openSheet({ type: 'confirm-delete-document', documentId: menuDocument.id }),
                },
              ]
            : []
        }
      />
    </>
  );
}
