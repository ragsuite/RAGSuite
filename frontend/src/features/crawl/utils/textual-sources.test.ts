import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { isDocumentIngestInFlight } from '@/features/crawl/utils/crawl-document-status';
import { mapApiDocument } from '@/features/crawl/utils/document-api-mappers';
import { filterUploadDocumentsList } from '@/features/crawl/utils/document-filter-utils';
import { computeUploadDocumentStats } from '@/features/crawl/utils/document-gmail-utils';
import {
  createQaPairDraft,
  emptyQaSourceForm,
  filterTextualSources,
  isDocumentBackedTab,
  parseQaPairsContent,
  qaSourceFormFromDocument,
  TEXTUAL_SOURCE_LIMITS,
  textSourceFormFromDocument,
  textualKindForDocument,
  toQaSourceRequest,
  toTextSourceRequest,
  validateQaSourceForm,
  validateTextSourceForm,
} from '@/features/crawl/utils/textual-sources';

function doc(overrides: Partial<CrawlDocument>): CrawlDocument {
  return {
    id: 'doc-1',
    name: 'file.pdf',
    title: 'File',
    description: null,
    mimeType: 'application/pdf',
    sizeKb: 1,
    sourceLabel: 'manual-uploads',
    language: 'en',
    indexedAt: null,
    status: 'indexed',
    checksum: '',
    chunksCount: 3,
    embeddedModels: [],
    fileUrl: null,
    trainingProgress: null,
    ingestEmbeddingTarget: null,
    ...overrides,
  };
}

const textDoc = doc({ id: 't1', title: 'Policy', sourceLabel: 'text', mimeType: 'text/x-ragsuite-text' });
const qaDoc = doc({ id: 'q1', title: 'FAQ', sourceLabel: 'qa_pairs', language: 'xx' });
const pdfDoc = doc({ id: 'p1' });

describe('textual source classification', () => {
  it('detects text and Q&A documents by source label', () => {
    expect(textualKindForDocument(textDoc)).toBe('text');
    expect(textualKindForDocument(qaDoc)).toBe('qa');
    expect(textualKindForDocument(pdfDoc)).toBeNull();
    expect(filterTextualSources([textDoc, qaDoc, pdfDoc], 'text').map((d) => d.id)).toEqual(['t1']);
    expect(filterTextualSources([textDoc, qaDoc, pdfDoc], 'qa').map((d) => d.id)).toEqual(['q1']);
  });

  it('keeps text and Q&A sources out of the Document tab list and stats', () => {
    const filters = { query: '', type: 'all' as const, status: 'all' as const };
    expect(filterUploadDocumentsList([textDoc, qaDoc, pdfDoc], filters).map((d) => d.id)).toEqual(['p1']);
    expect(computeUploadDocumentStats([textDoc, qaDoc, pdfDoc]).total).toBe(1);
  });

  it('polls documents on every document-backed tab', () => {
    expect(isDocumentBackedTab('document')).toBe(true);
    expect(isDocumentBackedTab('text')).toBe(true);
    expect(isDocumentBackedTab('qa-pairs')).toBe(true);
    expect(isDocumentBackedTab('domain')).toBe(false);
  });

  it('maps the backend "Not Trained" status without treating it as in-flight', () => {
    const mapped = mapApiDocument({ id: 'x', title: 'Draft', source: 'text', status: 'Not Trained' });
    expect(mapped?.status).toBe('not_trained');
    expect(isDocumentIngestInFlight('not_trained')).toBe(false);
  });
});

describe('text source form', () => {
  it('validates name and content', () => {
    const form = { title: '', content: 'x', description: '', language: 'en' };
    expect(validateTextSourceForm(form)).toBe('crawl.textual.validation.nameRequired');
    expect(validateTextSourceForm({ ...form, title: 'A', content: '  ' })).toBe(
      'crawl.text.validation.contentRequired',
    );
    expect(validateTextSourceForm({ ...form, title: 'A' })).toBeNull();
  });

  it('measures rich content by visible text', () => {
    const form = { title: 'A', content: '<p><br></p>', description: '', language: 'en' };
    expect(validateTextSourceForm(form)).toBe('crawl.text.validation.contentRequired');
    const visible = 'x'.repeat(TEXTUAL_SOURCE_LIMITS.content);
    expect(validateTextSourceForm({ ...form, content: `<p><strong>${visible}</strong></p>` })).toBeNull();
    expect(validateTextSourceForm({ ...form, content: `<p>${visible}y</p>` })).toBe(
      'crawl.text.validation.contentTooLong',
    );
  });

  it('builds a trimmed request and drops an empty description', () => {
    expect(
      toTextSourceRequest({ title: ' Policy ', content: ' Body ', description: '  ', language: 'de' }),
    ).toEqual({ title: 'Policy', content: 'Body', content_format: 'plain', description: undefined, language: 'de' });
    expect(
      toTextSourceRequest({ title: 'P', content: '<p>Body</p>', description: '', language: 'en' }).content_format,
    ).toBe('html');
  });

  it('loads an edit form from a document', () => {
    expect(textSourceFormFromDocument(textDoc, 'Body')).toEqual({
      title: 'Policy',
      content: 'Body',
      description: '',
      language: 'en',
    });
  });
});

describe('Q&A source form', () => {
  it('parses stored JSON and ignores incomplete or invalid data', () => {
    const raw = JSON.stringify({ pairs: [{ question: 'Q?', answer: 'A.' }, { question: 'Only Q', answer: '' }] });
    expect(parseQaPairsContent(raw)).toEqual([{ question: 'Q?', answer: 'A.' }]);
    expect(parseQaPairsContent('not json')).toEqual([]);
  });

  it('falls back to one blank pair and a default language when loading bad data', () => {
    const form = qaSourceFormFromDocument(qaDoc, '{}');
    expect(form.pairs).toHaveLength(1);
    expect(form.language).toBe('en');
  });

  it('validates pairs and ignores fully blank rows', () => {
    const base = { ...emptyQaSourceForm(), title: 'FAQ' };
    expect(validateQaSourceForm(base)).toBe('crawl.qa.validation.pairsRequired');
    expect(validateQaSourceForm({ ...base, pairs: [createQaPairDraft('Q?', '')] })).toBe(
      'crawl.qa.validation.pairIncomplete',
    );
    const valid = { ...base, pairs: [createQaPairDraft('Q?', 'A.'), createQaPairDraft()] };
    expect(validateQaSourceForm(valid)).toBeNull();
    expect(toQaSourceRequest(valid).pairs).toEqual([{ question: 'Q?', answer: 'A.' }]);
  });

  it('treats empty rich answers as missing and checks visible answer length', () => {
    const base = { ...emptyQaSourceForm(), title: 'FAQ' };
    expect(validateQaSourceForm({ ...base, pairs: [createQaPairDraft('Q?', '<p></p>')] })).toBe(
      'crawl.qa.validation.pairIncomplete',
    );
    expect(validateQaSourceForm({ ...base, pairs: [createQaPairDraft('', '<p></p>')] })).toBe(
      'crawl.qa.validation.pairsRequired',
    );
    const long = `<p>${'a'.repeat(TEXTUAL_SOURCE_LIMITS.answer + 1)}</p>`;
    expect(validateQaSourceForm({ ...base, pairs: [createQaPairDraft('Q?', long)] })).toBe(
      'crawl.qa.validation.answerTooLong',
    );
  });

  it('creates unique pair ids', () => {
    expect(createQaPairDraft().id).not.toBe(createQaPairDraft().id);
  });
});
