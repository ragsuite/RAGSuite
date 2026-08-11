/**
 * Collapse assistant markdown/HTML-ish markers into a single plain-text line
 * suitable for truncated History list/card previews.
 */
export function stripMarkdownToPlainText(markdown: string): string {
  const source = markdown.trim();
  if (!source) return '';

  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim(),
    )
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
