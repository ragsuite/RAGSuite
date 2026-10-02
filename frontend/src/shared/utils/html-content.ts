import { blocksToPlainText, parseHtmlContent } from '@/shared/utils/html-blocks';
import { decodeHtmlEntities } from '@/shared/utils/html-inline';

export { parseHtmlContent, type HtmlContentBlock, type HtmlTableRow, type HtmlTextAlign } from '@/shared/utils/html-blocks';
export { decodeHtmlEntities, parseInlineHtml, type HtmlInlineNode } from '@/shared/utils/html-inline';

export function isHtmlContent(text: string): boolean {
  // Require intentional HTML tags — not generics like List<string> or <https://…>.
  return /<\/?(?:p|div|span|br|hr|h[1-6]|ul|ol|li|table|colgroup|col|thead|tbody|tr|th|td|strong|b|em|i|sub|sup|mark|a|code|pre|blockquote|section|article|header|footer|nav|main|img|figure|figcaption)(?:\s[^>]*)?\/?>/i.test(
    text.trim(),
  );
}

/**
 * Models sometimes emit Markdown `**bold**` inside HTML answers.
 * Convert closed markers to <strong> so they render (incl. mid-stream after close).
 */
export function inflateMarkdownBoldToHtml(text: string): string {
  if (!text.includes('**')) return text;
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export function htmlToPlainText(html: string): string {
  if (!isHtmlContent(html)) return html.trim();
  const text = blocksToPlainText(parseHtmlContent(html));
  if (text) return text;
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).replace(/\u00AD/g, '').trim();
}

export function getRenderablePlainText(content: string): string {
  if (!content.trim()) return '';
  return isHtmlContent(content) ? htmlToPlainText(content) : content.trim();
}
