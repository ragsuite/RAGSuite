import { stripMarkdownToPlainText } from '@/features/chat-history/utils/strip-markdown-to-plain-text';

describe('stripMarkdownToPlainText', () => {
  it('strips HTML paragraph tags from search-style answers', () => {
    const result = stripMarkdownToPlainText(
      '<p>T3Planet is the first and only dedicated one-stop marketplace.</p>',
    );
    expect(result).toBe('T3Planet is the first and only dedicated one-stop marketplace.');
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('</p>');
  });

  it('still strips markdown markers from plain answers', () => {
    expect(stripMarkdownToPlainText('**Bold** and `code`')).toBe('Bold and code');
  });

  it('returns empty string for blank input', () => {
    expect(stripMarkdownToPlainText('   ')).toBe('');
  });
});
