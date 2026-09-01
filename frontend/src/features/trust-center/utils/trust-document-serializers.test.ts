import type { TrustDocument } from '@/features/trust-center/content/types';
import { trustExportFilename } from '@/features/trust-center/utils/export-trust-document';
import {
  printTrustDocumentHtml,
  trustDocumentToDocxBuffer,
  trustDocumentToHtmlDocument,
  trustDocumentToMarkdown,
  trustDocumentToPlainText,
} from '@/features/trust-center/utils/trust-document-serializers';

const fixtureDoc: TrustDocument = {
  id: 'overview',
  title: 'Trust Center Overview',
  version: '1.0.0',
  updatedAt: '2026-08-27',
  sections: [
    {
      heading: 'Roles under GDPR',
      paragraphs: ['Customer is the Controller.'],
      bullets: ['RAGSuite operator acts as Processor when hosted.'],
    },
  ],
};

describe('trustDocumentToMarkdown', () => {
  it('includes title, metadata, sections, and bullets', () => {
    const markdown = trustDocumentToMarkdown(fixtureDoc, 'RAGSuite');
    expect(markdown).toContain('# Trust Center Overview');
    expect(markdown).toContain('**Version:** 1.0.0');
    expect(markdown).toContain('## Roles under GDPR');
    expect(markdown).toContain('- RAGSuite operator acts as Processor when hosted.');
  });
});

describe('trustDocumentToPlainText', () => {
  it('renders readable plain text without markdown markers', () => {
    const text = trustDocumentToPlainText(fixtureDoc, 'RAGSuite');
    expect(text).toContain('Trust Center Overview');
    expect(text).toContain('Roles under GDPR');
    expect(text).not.toContain('##');
  });
});

describe('trustDocumentToHtmlDocument', () => {
  it('returns standalone HTML with print CSS and escaped content', () => {
    const html = trustDocumentToHtmlDocument(fixtureDoc, 'RAGSuite');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@page { size: A4; margin: 18mm 16mm; }');
    expect(html).toContain('<h1>Trust Center Overview</h1>');
    expect(html).toContain('<h2>Roles under GDPR</h2>');
    expect(html).toContain('<li>RAGSuite operator acts as Processor when hosted.</li>');
    expect(html).not.toContain('data-trust-print-root');
  });
});

describe('trustDocumentToDocxBuffer', () => {
  it('produces a non-empty docx buffer', async () => {
    const buffer = await trustDocumentToDocxBuffer(fixtureDoc, 'RAGSuite');
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});

describe('trustExportFilename', () => {
  it('builds filenames for each extension', () => {
    expect(trustExportFilename(fixtureDoc, 'en', 'md')).toBe(
      'ragsuite-trust-center-overview-en.md',
    );
    expect(trustExportFilename(fixtureDoc, 'de', 'docx')).toBe(
      'ragsuite-trust-center-overview-de.docx',
    );
    expect(trustExportFilename(fixtureDoc, 'en', 'html')).toBe(
      'ragsuite-trust-center-overview-en.html',
    );
  });
});

describe('printTrustDocumentHtml', () => {
  const originalDocument = global.document;
  const originalRequestAnimationFrame = global.requestAnimationFrame;

  beforeEach(() => {
    jest.useFakeTimers();
    global.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    global.document = originalDocument;
    global.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it('writes HTML into an iframe, prints, and removes it', () => {
    const print = jest.fn();
    const addEventListener = jest.fn();
    const frameDocument = {
      title: '',
      open: jest.fn(),
      write: jest.fn(),
      close: jest.fn(),
    } as unknown as Document;
    const frameWindow = {
      focus: jest.fn(),
      print,
      addEventListener,
      document: frameDocument,
      onafterprint: null,
    } as unknown as Window;

    const iframe = {
      style: {} as CSSStyleDeclaration,
      setAttribute: jest.fn(),
      contentWindow: frameWindow,
      contentDocument: frameDocument,
      remove: jest.fn(),
    } as unknown as HTMLIFrameElement;

    global.document = {
      createElement: jest.fn().mockReturnValue(iframe),
      body: { appendChild: jest.fn() },
    } as unknown as Document;

    printTrustDocumentHtml('<html><body>Trust</body></html>', 'Trust Center Overview');

    expect(frameDocument.open).toHaveBeenCalled();
    expect(frameDocument.write).toHaveBeenCalledWith('<html><body>Trust</body></html>');
    expect(frameDocument.close).toHaveBeenCalled();
    jest.runAllTimers();
    expect(frameWindow.focus).toHaveBeenCalled();
    expect(print).toHaveBeenCalled();
    expect(iframe.remove).toHaveBeenCalled();
  });
});
