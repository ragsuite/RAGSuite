import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import * as DocumentPicker from 'expo-document-picker';

import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import type { DocumentUploadProgress } from '@/features/crawl/providers/document-upload-progress-provider';
import type { CrawlDocument, DocumentFormPayload } from '@/features/crawl/types/crawl.types';
import {
  DEFAULT_DOCUMENT_FORM,
  DOCUMENT_LANGUAGE_OPTIONS,
  DOCUMENT_UPLOAD_FORMAT_HINT,
  documentToForm,
  formatDocumentFileLabel,
  inferMimeType,
} from '@/features/crawl/utils/document-form';
import {
  expandDocumentUploadFiles,
  type DocumentUploadFile,
  type DocumentUploadQueueItem,
} from '@/features/crawl/utils/document-upload-queue';
import { useTranslation } from '@/i18n';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  mode: 'upload' | 'edit';
  document?: CrawlDocument | null;
  saving: boolean;
  uploadProgress?: DocumentUploadProgress | null;
  onClose: () => void;
  onSubmit: (payload: DocumentFormPayload) => void;
};

export function DocumentFormSheet({
  visible,
  mode,
  document,
  saving,
  uploadProgress,
  onClose,
  onSubmit,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const [form, setForm] = useState<DocumentFormPayload>(DEFAULT_DOCUMENT_FORM);
  const [pickedFiles, setPickedFiles] = useState<DocumentUploadFile[]>([]);
  const [uploadQueue, setUploadQueue] = useState<DocumentUploadQueueItem[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const webInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && document) {
      setForm(documentToForm(document));
      setPickedFiles([]);
      setUploadQueue([]);
      setSkippedCount(0);
      return;
    }
    setForm(DEFAULT_DOCUMENT_FORM);
    setPickedFiles([]);
    setUploadQueue([]);
    setSkippedCount(0);
  }, [visible, mode, document]);

  const fileNames = uploadQueue.length > 0 ? uploadQueue.map((item) => item.relPath) : pickedFiles.map((file) => ('name' in file ? file.name : (file as File).name));
  const canSubmit =
    mode === 'edit'
      ? Boolean(form.title.trim() || form.sourceLabel.trim())
      : uploadQueue.length > 0 || pickedFiles.length > 0;
  const isUploading = saving && mode === 'upload';

  const syncQueueFromFiles = async (files: DocumentUploadFile[]) => {
    setIsProcessingFiles(true);
    try {
      const { queue, skipped } = await expandDocumentUploadFiles(files);
      setUploadQueue(queue);
      setSkippedCount(skipped);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const applyPickedFiles = (files: DocumentUploadFile[]) => {
    setPickedFiles(files);
    setForm((current) => ({
      ...current,
      fileNames: files.map((file) => ('name' in file ? file.name : (file as File).name)),
      sourceLabel: current.sourceLabel.trim() ? current.sourceLabel : 'manual-uploads',
      files,
    }));
    void syncQueueFromFiles(files);
  };

  const chooseFilesNative = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: form.uploadAsFolder,
      copyToCacheDirectory: true,
      type: '*/*',
    });
    if (result.canceled) return;
    const assets = result.assets ?? [];
    const next = assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? inferMimeType(asset.name),
    }));
    applyPickedFiles(form.uploadAsFolder ? [...pickedFiles, ...next] : next.slice(0, 1));
  };

  const chooseFilesWeb = () => {
    webInputRef.current?.click();
  };

  const onWebFilesSelected = (event: { target: { files: FileList | null; value: string } }) => {
    const fileList = event.target.files;
    if (!fileList?.length) return;
    const files = Array.from(fileList) as File[];
    applyPickedFiles(form.uploadAsFolder ? [...pickedFiles, ...files] : files);
    event.target.value = '';
  };

  const chooseFiles = () => {
    if (Platform.OS === 'web') {
      chooseFilesWeb();
      return;
    }
    void chooseFilesNative();
  };

  const isUpload = mode === 'upload';

  return (
    <CrawlSheet
      visible={visible}
      size="sideSheetMd"
      title={isUpload ? t('documents.uploadTitle') : t('documents.editTitle')}
      subtitle={
        isUpload
          ? isUploading && uploadProgress
            ? t('documents.uploadProgress', {
                done: uploadProgress.done,
                total: uploadProgress.total,
              })
            : t('documents.uploadDialogDescription')
          : t('documents.editSubtitle')
      }
      onClose={onClose}
      footerBordered
      footer={
        <OverlayDialogFooter
          cancelLabel={t('common.cancel')}
          primaryLabel={isUpload ? t('documents.uploadTitle') : t('settings.actions.saveChanges')}
          onCancel={onClose}
          onPrimary={() =>
            onSubmit({
              ...form,
              fileNames,
              files: uploadQueue.length > 0 ? uploadQueue.map((item) => item.file) : pickedFiles,
            })
          }
          primaryLoading={isUploading}
          primaryDisabled={isUploading || !canSubmit || isProcessingFiles}
          cancelDisabled={isUploading}
        />
      }>
      {isUpload && isUploading && uploadProgress ? (
        <View
          style={[
            styles.progressBanner,
            {
              borderColor: `${colors.primary}55`,
              backgroundColor: `${colors.primary}12`,
              borderRadius: surfaceRadius.card,
              padding: spacing.sm,
            },
          ]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.caption, { color: colors.primary, fontWeight: '500' }]}>
              {t('documents.uploadInProgressTitle')}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t('documents.uploadInProgressBody', {
                done: uploadProgress.done,
                total: uploadProgress.total,
              })}
              {uploadProgress.failed > 0
                ? ` ${t('documents.uploadFailedSoFar', { count: uploadProgress.failed })}`
                : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {isUpload ? (
        <View style={{ gap: spacing.xs }}>
          {Platform.OS === 'web' ? (
            <input
              ref={webInputRef}
              type="file"
              multiple={form.uploadAsFolder}
              accept=".pdf,.doc,.docx,.txt,.md,.html,.htm,.zip"
              style={{ display: 'none' }}
              onChange={onWebFilesSelected}
            />
          ) : null}
          <View style={styles.fileHeaderRow}>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
              {form.uploadAsFolder ? t('documents.upload.selectFolder') : t('documents.upload.selectFiles')}
            </Text>
            <View style={styles.folderToggle}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{t('documents.upload.uploadAsFolder')}</Text>
              <Switch
                accessibilityLabel={t('documents.upload.uploadAsFolderA11y')}
                value={form.uploadAsFolder}
                disabled={isUploading}
                onValueChange={(uploadAsFolder) => {
                  setForm((current) => ({ ...current, uploadAsFolder }));
                  if (!uploadAsFolder && pickedFiles.length > 1) {
                    applyPickedFiles(pickedFiles.slice(0, 1));
                  }
                }}
              />
            </View>
          </View>
          <View style={[styles.fileRow, { borderColor: colors.border, borderRadius: surfaceRadius.card }]}>
            <AppButton
              variant="cta"
              size="compact"
              label={t('documents.upload.chooseFiles')}
              disabled={isUploading}
              onPress={chooseFiles}
            />
            <Text style={[typography.body, { color: colors.textMuted, flex: 1 }]} numberOfLines={2}>
              {formatDocumentFileLabel(fileNames)}
            </Text>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
            {form.uploadAsFolder ? t('documents.upload.folderModeHint') : DOCUMENT_UPLOAD_FORMAT_HINT}
          </Text>
          {isProcessingFiles ? (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[typography.caption, { color: colors.textMuted }]}>{t('documents.upload.readingFiles')}</Text>
            </View>
          ) : null}
          {!isProcessingFiles && uploadQueue.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
                {uploadQueue.length === 1
                  ? t('documents.upload.filesQueued', { count: uploadQueue.length })
                  : t('documents.upload.filesQueuedPlural', { count: uploadQueue.length })}
                {skippedCount > 0 ? t('documents.upload.skippedUnsupported', { count: skippedCount }) : ''}
              </Text>
              <AppScrollView style={[styles.queueList, { borderColor: colors.border, borderRadius: surfaceRadius.card }]}>
                {uploadQueue.map((item) => (
                  <Text key={item.relPath} style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    {item.relPath}
                  </Text>
                ))}
              </AppScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      <AppTextField
        label={t('documents.form.titleOptional')}
        value={form.title}
        onChangeText={(title) => setForm((current) => ({ ...current, title }))}
        placeholder={t('documents.form.titlePlaceholder')}
      />
      <AppTextField
        label={t('documents.form.descriptionOptional')}
        value={form.description}
        onChangeText={(description) => setForm((current) => ({ ...current, description }))}
        placeholder={t('documents.form.descriptionPlaceholder')}
        multiline
        numberOfLines={4}
        style={{ minHeight: 96, textAlignVertical: 'top' }}
      />
      <AppSelectField
        label={t('documents.fields.language')}
        value={form.language}
        pickerPresentation="inline"
        options={DOCUMENT_LANGUAGE_OPTIONS.map((option) => ({ key: option.key, label: option.label }))}
        onChange={(language) => setForm((current) => ({ ...current, language }))}
      />
      <AppTextField
        label={t('documents.form.sourceCollection')}
        value={form.sourceLabel}
        onChangeText={(sourceLabel) => setForm((current) => ({ ...current, sourceLabel }))}
        placeholder={t('documents.form.sourceCollectionPlaceholder')}
        autoCapitalize="none"
      />
    </CrawlSheet>
  );
}

const styles = StyleSheet.create({
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
  },
  fileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  folderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 10,
    gap: 12,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  queueList: {
    maxHeight: 140,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
});
