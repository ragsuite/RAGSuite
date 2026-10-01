import {
  canOpenDocumentInBrowser,
  resolveDocumentPreviewKind,
} from '@/features/crawl/utils/document-preview-kind';

function doc(title: string, mimeType: string, sourceLabel = 'manual-uploads') {
  return { title, name: title, mimeType, sourceLabel };
}

describe('resolveDocumentPreviewKind', () => {
  it.each([
    ['1mb.xlsx', 'application/XLSX', 'server'],
    ['deck.pptx', 'application/PPTX', 'pptx'],
    ['handbook.docx', 'application/DOCX', 'docx'],
    ['manual.pdf', 'application/pdf', 'pdf'],
    ['notes.md', 'text/markdown', 'text'],
    ['export.csv', 'application/vnd.ms-excel', 'text'],
    ['legacy.doc', 'application/msword', 'unsupported'],
    ['legacy.ppt', 'application/vnd.ms-powerpoint', 'unsupported'],
    ['legacy.xls', 'application/vnd.ms-excel', 'unsupported'],
  ])('classifies %s (%s) as %s', (title, mime, expected) => {
    expect(resolveDocumentPreviewKind(doc(title, mime))).toBe(expected);
  });

  it('falls back to the MIME type when the title has no extension', () => {
    expect(resolveDocumentPreviewKind(doc('Quarterly numbers', 'application/XLSX'))).toBe('server');
    expect(
      resolveDocumentPreviewKind(
        doc('Plan', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      ),
    ).toBe('pptx');
    expect(resolveDocumentPreviewKind(doc('Inbox', 'message/rfc822', 'gmail'))).toBe('text');
    expect(resolveDocumentPreviewKind(doc('Blob', 'application/octet-stream'))).toBe('unsupported');
  });

  it('prefers the server-reported MIME type over the stored one', () => {
    expect(
      resolveDocumentPreviewKind(
        doc('Report', 'application/octet-stream'),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('docx');
  });
});

describe('canOpenDocumentInBrowser', () => {
  it('only offers "Open in new tab" when a browser can show the file', () => {
    expect(canOpenDocumentInBrowser('server')).toBe(true);
    expect(canOpenDocumentInBrowser('pdf')).toBe(true);
    expect(canOpenDocumentInBrowser('unsupported')).toBe(false);
  });
});
