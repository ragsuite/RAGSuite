import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { DocumentUploadQueueItem } from '@/features/crawl/utils/document-upload-queue';
import type { DocumentMetadataInput } from '@/network/actions/document.actions';
import { handleUploadDocument } from '@/network/actions/document.actions';

export type DocumentUploadProgress = {
  done: number;
  total: number;
  failed: number;
};

export type DocumentUploadBatchResult =
  | {
      status: 'completed';
      succeeded: number;
      failedFiles: { name: string; reason: string }[];
      total: number;
    }
  | { status: 'skipped'; reason: 'already_running' };

type UploadBatchParams = {
  queue: DocumentUploadQueueItem[];
  metadata: DocumentMetadataInput;
  onAfterEachUpload?: () => void;
};

type DocumentUploadProgressContextValue = {
  progress: DocumentUploadProgress | null;
  isUploading: boolean;
  uploadBatch: (params: UploadBatchParams) => Promise<DocumentUploadBatchResult>;
};

const DocumentUploadProgressContext = createContext<DocumentUploadProgressContextValue | null>(null);

function normalizeUploadError(error: unknown): string {
  const err = error as {
    message?: string;
    response?: { status?: number; data?: { detail?: unknown } };
  };
  const status = err?.response?.status;
  const detail =
    typeof err?.response?.data?.detail === 'string'
      ? err.response.data.detail
      : err?.message ?? '';

  if (status === 429) return 'Upload queue is full. Please wait and try again.';
  if (status === 503) return 'Service unavailable. Please try again in a few minutes.';
  if (status === 400 && (detail.includes('exceeds') || detail.includes('size'))) {
    return 'File is too large. Maximum allowed size is 50MB.';
  }
  if (detail) return detail;
  return 'Upload failed. Please try again.';
}

export function DocumentUploadProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<DocumentUploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const runningRef = useRef(false);

  const uploadBatch = useCallback(async ({
    queue,
    metadata,
    onAfterEachUpload,
  }: UploadBatchParams): Promise<DocumentUploadBatchResult> => {
    if (runningRef.current) {
      return { status: 'skipped', reason: 'already_running' };
    }
    if (queue.length === 0) {
      return { status: 'completed', succeeded: 0, failedFiles: [], total: 0 };
    }

    runningRef.current = true;
    setIsUploading(true);
    setProgress({ done: 0, total: queue.length, failed: 0 });

    const failedFiles: { name: string; reason: string }[] = [];
    let succeeded = 0;

    try {
      for (let i = 0; i < queue.length; i += 1) {
        const item = queue[i];
        try {
          const fileName =
            typeof File !== 'undefined' && item.file instanceof File
              ? item.file.name
              : (item.file as { name: string }).name;
          await handleUploadDocument(item.file, {
            ...metadata,
            title: metadata.title ?? fileName,
            source: metadata.source || item.relPath,
          });
          succeeded += 1;
          onAfterEachUpload?.();
        } catch (error) {
          failedFiles.push({ name: item.relPath, reason: normalizeUploadError(error) });
        }
        setProgress({
          done: i + 1,
          total: queue.length,
          failed: failedFiles.length,
        });
      }

      return {
        status: 'completed',
        succeeded,
        failedFiles,
        total: queue.length,
      };
    } finally {
      setIsUploading(false);
      setProgress(null);
      runningRef.current = false;
    }
  }, []);

  const value = useMemo(
    () => ({
      progress,
      isUploading,
      uploadBatch,
    }),
    [progress, isUploading, uploadBatch],
  );

  return (
    <DocumentUploadProgressContext.Provider value={value}>{children}</DocumentUploadProgressContext.Provider>
  );
}

export function useDocumentUploadProgress(): DocumentUploadProgressContextValue {
  const ctx = useContext(DocumentUploadProgressContext);
  if (!ctx) {
    throw new Error('useDocumentUploadProgress must be used within DocumentUploadProgressProvider');
  }
  return ctx;
}
