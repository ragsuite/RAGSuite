import { citationSourceIconKind, parseCitationUrl } from '@/shared/utils/citation-url';

describe('citationSourceIconKind', () => {
  it('uses globe for normal web URLs', () => {
    expect(citationSourceIconKind('https://t3planet.de/templates')).toBe('globe');
  });

  it('uses pdf for .pdf paths', () => {
    expect(citationSourceIconKind('https://example.com/docs/guide.pdf')).toBe('pdf');
    expect(citationSourceIconKind('https://example.com/a.PDF?x=1')).toBe('pdf');
  });

  it('uses document for office/text extensions', () => {
    expect(citationSourceIconKind('https://example.com/a.docx')).toBe('document');
    expect(citationSourceIconKind('https://example.com/notes.txt')).toBe('document');
    expect(citationSourceIconKind('https://example.com/readme.md')).toBe('document');
  });

  it('uses document for internal Document citations', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(citationSourceIconKind(uuid)).toBe('document');
    expect(parseCitationUrl(uuid).domain).toBe('Document');
  });
});
