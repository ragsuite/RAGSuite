import {
  filenameFromContentDisposition,
  sanitizeSuggestedFilename,
} from '@/shared/utils/content-disposition';

describe('filenameFromContentDisposition', () => {
  it('returns null for empty headers', () => {
    expect(filenameFromContentDisposition(null)).toBeNull();
    expect(filenameFromContentDisposition('  ')).toBeNull();
  });

  it('reads quoted, plain, and RFC 5987 filenames', () => {
    expect(filenameFromContentDisposition('attachment; filename="audit-logs-1.csv"')).toBe('audit-logs-1.csv');
    expect(filenameFromContentDisposition('attachment; filename=audit.json')).toBe('audit.json');
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.csv")).toBe('résumé.csv');
  });
});

describe('sanitizeSuggestedFilename', () => {
  it('replaces path and reserved characters', () => {
    expect(sanitizeSuggestedFilename(' ../a:b*c?.csv ')).toBe('.._a_b_c_.csv');
  });
});
