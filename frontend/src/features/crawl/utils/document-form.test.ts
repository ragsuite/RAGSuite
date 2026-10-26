import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { mapApiDocument } from '@/features/crawl/utils/document-api-mappers';
import {
  DEFAULT_DOCUMENT_FORM,
  documentToForm,
  extractFieldVisibility,
  isPdfDocument,
  isSpreadsheetFileName,
  parsePdfPageField,
  showExcelAsHtmlForDocument,
  toDocumentPdfMetadata,
  toDocumentSplitFields,
} from '@/features/crawl/utils/document-form';

function doc(overrides: Partial<CrawlDocument> = {}): CrawlDocument {
  return {
    id: 'doc-1',
    name: 'guide.pdf',
    title: 'Guide',
    description: null,
    mimeType: 'application/pdf',
    sizeKb: 12,
    sourceLabel: 'manual-uploads',
    language: 'en',
    indexedAt: null,
    status: 'indexed',
    checksum: '',
    chunksCount: 2,
    embeddedModels: [],
    fileUrl: null,
    trainingProgress: null,
    ingestEmbeddingTarget: null,
    useInAnswers: true,
    pdfPageFrom: null,
    pdfPageTo: null,
    pdfStripChrome: null,
    pdfStripHeader: null,
    pdfStripFooter: null,
    ...overrides,
  };
}

describe('document extract form helpers', () => {
  it('parses empty or invalid page fields as all pages', () => {
    expect(parsePdfPageField('')).toBeNull();
    expect(parsePdfPageField('  ')).toBeNull();
    expect(parsePdfPageField('0')).toBeNull();
    expect(parsePdfPageField('3')).toBe(3);
  });

  it('hides range and strip until a capable file is chosen', () => {
    expect(extractFieldVisibility({ mode: 'upload', fileNames: [] })).toEqual({
      showRange: false,
      showStrip: false,
      showEngine: false,
      rangeUnit: 'page',
    });
    expect(extractFieldVisibility({ mode: 'upload', fileNames: ['notes.txt'] })).toEqual({
      showRange: false,
      showStrip: false,
      showEngine: false,
      rangeUnit: 'page',
    });
    expect(extractFieldVisibility({ mode: 'upload', fileNames: ['table.csv'] }).showEngine).toBe(false);
  });

  it('shows page range and strip for PDFs, slides for PPTX, sheets for XLSX', () => {
    expect(extractFieldVisibility({ mode: 'upload', fileNames: ['a.pdf'] })).toEqual({
      showRange: true,
      showStrip: true,
      showEngine: true,
      rangeUnit: 'page',
    });
    expect(extractFieldVisibility({ mode: 'upload', fileNames: ['deck.pptx'] })).toEqual({
      showRange: true,
      showStrip: true,
      showEngine: true,
      rangeUnit: 'slide',
    });
    expect(extractFieldVisibility({ mode: 'upload', fileNames: ['data.xlsx'] })).toEqual({
      showRange: true,
      showStrip: false,
      showEngine: true,
      rangeUnit: 'sheet',
    });
  });

  it('shows Word header strip without a page range, and mixed range for ZIP or mixed files', () => {
    expect(extractFieldVisibility({ mode: 'upload', fileNames: ['policy.docx'] })).toEqual({
      showRange: false,
      showStrip: true,
      showEngine: true,
      rangeUnit: 'page',
    });
    expect(extractFieldVisibility({ mode: 'upload', fileNames: ['pack.zip'] })).toEqual({
      showRange: true,
      showStrip: true,
      showEngine: true,
      rangeUnit: 'mixed',
    });
    expect(extractFieldVisibility({ mode: 'upload', fileNames: ['a.pdf', 'deck.pptx'] }).rangeUnit).toBe(
      'mixed',
    );
  });

  it('hydrates edit visibility from the document type', () => {
    expect(extractFieldVisibility({ mode: 'edit', fileNames: [], document: doc() }).showRange).toBe(true);
    expect(extractFieldVisibility({ mode: 'edit', fileNames: [], document: doc() }).showEngine).toBe(true);
    expect(
      extractFieldVisibility({
        mode: 'edit',
        fileNames: [],
        document: doc({
          name: 'notes.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      }),
    ).toEqual({ showRange: false, showStrip: true, showEngine: true, rangeUnit: 'page' });
    expect(
      extractFieldVisibility({
        mode: 'edit',
        fileNames: [],
        document: doc({ name: 'readme.txt', mimeType: 'text/plain' }),
      }),
    ).toEqual({ showRange: false, showStrip: false, showEngine: false, rangeUnit: 'page' });
  });

  it('defaults new uploads to strip chrome and hydrates legacy docs as off', () => {
    expect(DEFAULT_DOCUMENT_FORM.pdfStripHeader).toBe(true);
    expect(DEFAULT_DOCUMENT_FORM.pdfStripFooter).toBe(true);
    expect(DEFAULT_DOCUMENT_FORM.pdfStripChrome).toBe(true);
    expect(isPdfDocument(doc())).toBe(true);
    expect(documentToForm(doc()).pdfStripHeader).toBe(false);
    expect(documentToForm(doc()).pdfStripFooter).toBe(false);
    expect(documentToForm(doc()).pdfStripChrome).toBe(false);
    expect(documentToForm(doc({ pdfPageFrom: 3, pdfPageTo: 20, pdfStripChrome: true })).pdfPageFrom).toBe(3);
    expect(documentToForm(doc({ pdfStripChrome: true })).pdfStripHeader).toBe(true);
    expect(documentToForm(doc({ pdfStripHeader: true, pdfStripFooter: false })).pdfStripFooter).toBe(false);
    expect(toDocumentPdfMetadata(DEFAULT_DOCUMENT_FORM)).toEqual({
      pdf_page_from: null,
      pdf_page_to: null,
      pdf_strip_chrome: true,
      pdf_strip_header: true,
      pdf_strip_footer: true,
      extract_engine: 'native',
      ocr_model: null,
    });
    expect(
      toDocumentPdfMetadata({
        ...DEFAULT_DOCUMENT_FORM,
        pdfStripHeader: true,
        pdfStripFooter: false,
      }),
    ).toMatchObject({
      pdf_strip_header: true,
      pdf_strip_footer: false,
      pdf_strip_chrome: true,
    });
    expect(
      toDocumentPdfMetadata({ ...DEFAULT_DOCUMENT_FORM, extractEngine: 'docling' }).extract_engine,
    ).toBe('docling');
  });

  it('maps API PDF extract fields and leaves legacy rows unset', () => {
    expect(mapApiDocument({ id: 'd1', title: 'Guide' })?.pdfStripChrome).toBeNull();
    expect(mapApiDocument({ id: 'd1', title: 'Guide' })?.pdfStripHeader).toBeNull();
    const mapped = mapApiDocument({
      id: 'd2',
      title: 'Manual',
      pdfPageFrom: 3,
      pdfPageTo: 20,
      pdfStripChrome: true,
      pdfStripHeader: true,
      pdfStripFooter: false,
    });
    expect(mapped?.pdfPageFrom).toBe(3);
    expect(mapped?.pdfPageTo).toBe(20);
    expect(mapped?.pdfStripChrome).toBe(true);
    expect(mapped?.pdfStripHeader).toBe(true);
    expect(mapped?.pdfStripFooter).toBe(false);
    expect(mapApiDocument({ id: 'd3', title: 'Office', extractEngine: 'docling' })?.extractEngine).toBe(
      'docling',
    );
    expect(mapApiDocument({ id: 'd4', title: 'Scan', ocrModel: 'openai:gpt-4o' })?.ocrModel).toBe(
      'openai:gpt-4o',
    );
    expect(documentToForm(doc({ ocrModel: 'openai:gpt-4o' })).ocrModel).toBe('openai:gpt-4o');
    expect(toDocumentPdfMetadata({ ...DEFAULT_DOCUMENT_FORM, ocrModel: 'openai:gpt-4o' })).toMatchObject({
      ocr_model: 'openai:gpt-4o',
      extract_engine: 'docling',
    });
  });

  it('shows Excel as HTML only for spreadsheet files', () => {
    expect(isSpreadsheetFileName('data.xlsx')).toBe(true);
    expect(isSpreadsheetFileName('table.csv')).toBe(true);
    expect(isSpreadsheetFileName('guide.pdf')).toBe(false);
    expect(isSpreadsheetFileName('policy.docx')).toBe(false);
    expect(isSpreadsheetFileName('deck.pptx')).toBe(false);
    expect(isSpreadsheetFileName('pack.zip')).toBe(false);

    expect(showExcelAsHtmlForDocument({ mode: 'upload', fileNames: ['data.xlsx'] })).toBe(true);
    expect(showExcelAsHtmlForDocument({ mode: 'upload', fileNames: ['table.csv'] })).toBe(true);
    expect(showExcelAsHtmlForDocument({ mode: 'upload', fileNames: ['guide.pdf', 'data.xlsx'] })).toBe(true);
    expect(showExcelAsHtmlForDocument({ mode: 'upload', fileNames: ['guide.pdf'] })).toBe(false);
    expect(showExcelAsHtmlForDocument({ mode: 'upload', fileNames: ['policy.docx'] })).toBe(false);
    expect(showExcelAsHtmlForDocument({ mode: 'upload', fileNames: ['deck.pptx'] })).toBe(false);
    expect(showExcelAsHtmlForDocument({ mode: 'upload', fileNames: ['pack.zip'] })).toBe(false);
    expect(showExcelAsHtmlForDocument({ mode: 'upload', fileNames: [] })).toBe(false);

    expect(
      showExcelAsHtmlForDocument({
        mode: 'edit',
        fileNames: [],
        document: doc({ name: 'rates.csv', mimeType: 'text/csv' }),
      }),
    ).toBe(true);
    expect(
      showExcelAsHtmlForDocument({
        mode: 'edit',
        fileNames: [],
        document: doc({
          name: 'prices.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      }),
    ).toBe(true);
    expect(showExcelAsHtmlForDocument({ mode: 'edit', fileNames: [], document: doc() })).toBe(false);
    expect(
      showExcelAsHtmlForDocument({
        mode: 'edit',
        fileNames: [],
        document: doc({
          name: 'policy.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      }),
    ).toBe(false);
  });

  it('omits custom split fields when native', () => {
    expect(DEFAULT_DOCUMENT_FORM.splitMode).toBe('native');
    expect(toDocumentSplitFields(DEFAULT_DOCUMENT_FORM, { omitNative: true })).toEqual({});
    expect(
      toDocumentSplitFields({
        ...DEFAULT_DOCUMENT_FORM,
        splitMode: 'custom',
        chunkSize: 800,
        chunkOverlap: 200,
        delimiterPreset: 'paragraph',
      }),
    ).toMatchObject({ split_mode: 'custom', chunk_size: 800, chunk_overlap: 200 });
  });
});
