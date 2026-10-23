import type { QaSourceRequest, TextSourceRequest } from '@/features/crawl/types/textual-source.types';
import { readUseInAnswers } from '@/network/actions/answers-response';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post, postFormData, put } from '@/network/request';
import { extractApiErrorMessage } from '@/utils/api-error';
import type { AxiosError } from 'axios';

export type DocumentMetadataInput = {
  title?: string;
  description?: string;
  language?: string;
  source?: string;
  ingest_embedding_target?: string;
  pdf_page_from?: number | null;
  pdf_page_to?: number | null;
  pdf_strip_chrome?: boolean;
  pdf_strip_header?: boolean;
  pdf_strip_footer?: boolean;
  extract_engine?: 'native' | 'docling';
  ocr_model?: string | null;
  split_mode?: 'native' | 'custom';
  chunk_size?: number | null;
  chunk_overlap?: number | null;
  chunk_delimiter_preset?: string | null;
  chunk_delimiter_custom?: string | null;
};

export type DocumentFileInput =
  | File
  | { uri: string; name: string; mimeType?: string };

function normalizeUploadError(error: unknown): never {
  const axiosError = error as AxiosError<{ detail?: unknown }>;
  if (axiosError?.response) {
    const status = axiosError.response.status;
    const detail = extractApiErrorMessage(axiosError.response.data, '');

    if (status === 429) {
      throw new Error('errors.documents.uploadQueueFull');
    }
    if (status === 400 && (detail.includes('exceeds') || detail.includes('size'))) {
      throw new Error('errors.documents.fileTooLarge');
    }
    if (status === 503) {
      throw new Error('errors.documents.aiUnavailable');
    }
  }
  if (error instanceof Error) throw error;
  throw new Error('errors.documents.uploadFailed');
}

function appendFileToFormData(formData: FormData, file: DocumentFileInput) {
  if (typeof File !== 'undefined' && file instanceof File) {
    formData.append('files', file, file.name);
    return;
  }
  const native = file as { uri: string; name: string; mimeType?: string };
  formData.append('files', {
    uri: native.uri,
    name: native.name,
    type: native.mimeType ?? 'application/octet-stream',
  } as unknown as Blob);
}

export async function handleGetDocuments(): Promise<unknown> {
  return get(API_CONFIG.DOCUMENTS);
}

export type DocumentOcrOption = {
  provider: string;
  model: string;
  value: string;
};

export async function handleGetDocumentOcrOptions(): Promise<DocumentOcrOption[]> {
  const body = await get<{ success?: boolean; data?: DocumentOcrOption[] }>(API_CONFIG.DOCUMENT_OCR_OPTIONS);
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray(body.data)) return body.data;
  return [];
}

export async function handleUploadDocument(
  file: DocumentFileInput,
  metadata?: DocumentMetadataInput,
): Promise<unknown> {
  const formData = new FormData();
  appendFileToFormData(formData, file);

  if (metadata?.title) formData.append('title', metadata.title);
  if (metadata?.description) formData.append('description', metadata.description);
  if (metadata?.language) formData.append('language', metadata.language);
  if (metadata?.source) formData.append('source', metadata.source);
  if (metadata?.ingest_embedding_target) {
    formData.append('ingest_embedding_target', metadata.ingest_embedding_target);
  }
  if (metadata?.pdf_page_from != null) {
    formData.append('pdf_page_from', String(metadata.pdf_page_from));
  }
  if (metadata?.pdf_page_to != null) {
    formData.append('pdf_page_to', String(metadata.pdf_page_to));
  }
  if (metadata?.pdf_strip_chrome !== undefined) {
    formData.append('pdf_strip_chrome', metadata.pdf_strip_chrome ? 'true' : 'false');
  }
  if (metadata?.pdf_strip_header !== undefined) {
    formData.append('pdf_strip_header', metadata.pdf_strip_header ? 'true' : 'false');
  }
  if (metadata?.pdf_strip_footer !== undefined) {
    formData.append('pdf_strip_footer', metadata.pdf_strip_footer ? 'true' : 'false');
  }
  if (metadata?.extract_engine) {
    formData.append('extract_engine', metadata.extract_engine);
  }
  if (metadata?.ocr_model) {
    formData.append('ocr_model', metadata.ocr_model);
  }
  if (metadata?.split_mode) {
    formData.append('split_mode', metadata.split_mode);
  }
  if (metadata?.chunk_size != null) {
    formData.append('chunk_size', String(metadata.chunk_size));
  }
  if (metadata?.chunk_overlap != null) {
    formData.append('chunk_overlap', String(metadata.chunk_overlap));
  }
  if (metadata?.chunk_delimiter_preset) {
    formData.append('chunk_delimiter_preset', metadata.chunk_delimiter_preset);
  }
  if (metadata?.chunk_delimiter_custom) {
    formData.append('chunk_delimiter_custom', metadata.chunk_delimiter_custom);
  }

  try {
    return await postFormData(API_CONFIG.DOCUMENT_UPLOAD, formData);
  } catch (error) {
    normalizeUploadError(error);
  }
}
export async function handleUpdateDocument(id: string, metadata: DocumentMetadataInput): Promise<unknown> {
  return put(API_CONFIG.document(id), metadata);
}

export async function handleCreateTextSource(body: TextSourceRequest): Promise<unknown> {
  return post(API_CONFIG.DOCUMENT_TEXT, body);
}

export async function handleUpdateTextSource(id: string, body: TextSourceRequest): Promise<unknown> {
  return put(API_CONFIG.documentText(id), body);
}

export async function handleCreateQaSource(body: QaSourceRequest): Promise<unknown> {
  return post(API_CONFIG.DOCUMENT_QA_PAIRS, body);
}

export async function handleUpdateQaSource(id: string, body: QaSourceRequest): Promise<unknown> {
  return put(API_CONFIG.documentQaPairs(id), body);
}

export async function handleTrainTextSource(id: string): Promise<unknown> {
  return post(API_CONFIG.documentTextTrain(id), {});
}

export async function handleTrainQaSource(id: string): Promise<unknown> {
  return post(API_CONFIG.documentQaPairsTrain(id), {});
}

/** Train / retrain documents through their own AI model (pinned provider). */
export async function handleTrainDocuments(documentIds: string[]): Promise<unknown> {
  return post(API_CONFIG.DOCUMENT_TRAIN, { document_ids: documentIds });
}

export async function handleDeleteDocument(id: string): Promise<unknown> {
  return deleteApi(API_CONFIG.document(id));
}

/** Document, Text or Q&A source "Use in answers"; resolves to the saved flag. */
export async function handleSetDocumentAnswers(id: string, enabled: boolean): Promise<boolean> {
  return readUseInAnswers(await put<{ enabled: boolean }, unknown>(API_CONFIG.documentAnswers(id), { enabled }));
}

export async function handleGetDocumentContent(id: string): Promise<unknown> {
  return get(API_CONFIG.documentContent(id));
}

export async function handleGetDocumentChunks(
  id: string,
  limit = 30,
  offset = 0,
): Promise<unknown> {
  return get(`${API_CONFIG.documentChunks(id)}?limit=${limit}&offset=${offset}`);
}

export async function handleGetDocumentContentToken(id: string): Promise<string> {
  const body = await get<{ token?: string }>(API_CONFIG.documentContentToken(id));
  if (body && typeof body === 'object' && 'token' in body && typeof body.token === 'string') {
    return body.token;
  }
  throw new Error('errors.documents.contentTokenFailed');
}
