import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, postFormData, put } from '@/network/request';
import { extractApiErrorMessage } from '@/utils/api-error';
import type { AxiosError } from 'axios';

export type DocumentMetadataInput = {
  title?: string;
  description?: string;
  language?: string;
  source?: string;
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

  try {
    return await postFormData(API_CONFIG.DOCUMENT_UPLOAD, formData);
  } catch (error) {
    normalizeUploadError(error);
  }
}
export async function handleUpdateDocument(id: string, metadata: DocumentMetadataInput): Promise<unknown> {
  return put(API_CONFIG.document(id), metadata);
}

export async function handleDeleteDocument(id: string): Promise<unknown> {
  return deleteApi(API_CONFIG.document(id));
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
