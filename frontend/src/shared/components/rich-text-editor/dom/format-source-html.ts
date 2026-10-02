const BLOCK_CLOSE = /(<\/(?:p|h[1-6]|li|ul|ol|blockquote|pre|tr|thead|tbody|table)>|<hr\s*\/?>)/gi;
const BLOCK_OPEN = /(<(?:ul|ol|table|thead|tbody|tr)(?:\s[^>]*)?>)/gi;

/** Readable one-block-per-line HTML for the Source view (whitespace-insensitive markup). */
export function formatSourceHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(BLOCK_CLOSE, '$1\n')
    .replace(BLOCK_OPEN, '$1\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
