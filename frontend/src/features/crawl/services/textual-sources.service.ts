import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import type {
  QaSourceForm,
  TextSourceForm,
  TextualSourceSaveResponse,
} from '@/features/crawl/types/textual-source.types';
import { fetchDocumentTextContent } from '@/features/crawl/services/crawl.service';
import {
  qaSourceFormFromDocument,
  textSourceFormFromDocument,
  toQaSourceRequest,
  toTextSourceRequest,
} from '@/features/crawl/utils/textual-sources';
import {
  handleCreateQaSource,
  handleCreateTextSource,
  handleTrainQaSource,
  handleTrainTextSource,
  handleUpdateQaSource,
  handleUpdateTextSource,
} from '@/network/actions/document.actions';

function responseStatus(body: unknown): string {
  const status = (body as Partial<TextualSourceSaveResponse> | null)?.status;
  return typeof status === 'string' ? status : '';
}

/** Starts training; resolves with the backend status (`Queued` when async, final status when inline). */
export async function trainTextSource(documentId: string): Promise<string> {
  return responseStatus(await handleTrainTextSource(documentId));
}

export async function trainQaSource(documentId: string): Promise<string> {
  return responseStatus(await handleTrainQaSource(documentId));
}

export async function saveTextSource(form: TextSourceForm, documentId?: string): Promise<void> {
  const body = toTextSourceRequest(form);
  if (documentId) {
    await handleUpdateTextSource(documentId, body);
    return;
  }
  await handleCreateTextSource(body);
}

export async function saveQaSource(form: QaSourceForm, documentId?: string): Promise<void> {
  const body = toQaSourceRequest(form);
  if (documentId) {
    await handleUpdateQaSource(documentId, body);
    return;
  }
  await handleCreateQaSource(body);
}

export async function loadTextSourceForm(doc: CrawlDocument): Promise<TextSourceForm> {
  const content = await fetchDocumentTextContent(doc.id);
  return textSourceFormFromDocument(doc, content);
}

export async function loadQaSourceForm(doc: CrawlDocument): Promise<QaSourceForm> {
  const raw = await fetchDocumentTextContent(doc.id);
  return qaSourceFormFromDocument(doc, raw);
}
