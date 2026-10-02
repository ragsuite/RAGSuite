import { decodeHtmlEntities, inflateMarkdownBoldToHtml, isHtmlContent } from '@/shared/utils/html-content';

const SOFT_HYPHEN = /\u00AD/g;

/** True when *value* is editor HTML rather than legacy plain text. */
export function isRichHtml(value: string): boolean {
  return Boolean(value) && isHtmlContent(value);
}

const EDITOR_HTML_RE = /^\s*<(?:p|h[1-6]|ul|ol|blockquote|pre|table|hr)\b/i;

/**
 * Stricter check for rich-editor output (always opens with a block element).
 * Mirrors backend `is_editor_html`, which decides sanitizing and indexing for textual sources.
 */
export function isEditorHtml(value: string): boolean {
  return EDITOR_HTML_RE.test(value);
}

/**
 * Visible characters used for limits. Mirrors backend `rich_text_length`:
 * tags become spaces, entities decode, soft hyphens drop, whitespace collapses.
 */
export function richTextLength(value: string): number {
  return visibleText(value).length;
}

export function isRichTextEmpty(value: string): boolean {
  return richTextLength(value) === 0;
}

function visibleText(value: string): string {
  if (!value) return '';
  const text = isRichHtml(value) ? decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')) : value;
  return text.replace(SOFT_HYPHEN, '').replace(/\s+/g, ' ').trim();
}

/** Readable plain text that keeps paragraphs, list bullets and table rows. */
export function richHtmlToPlainText(value: string): string {
  if (!value) return '';
  if (!isRichHtml(value)) return value.trim();
  const text = value
    .replace(/<(li|td|th)([^>]*)>\s*<p[^>]*>/gi, '<$1$2>')
    .replace(/<\/p>\s*<\/(li|td|th)>/gi, '</$1>')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/(p|h[1-6]|blockquote|pre|table|ul|ol)>/gi, '\n\n')
    .replace(/<hr[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');
  return decodeHtmlEntities(text)
    .replace(SOFT_HYPHEN, '')
    .replace(/ \| \n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Legacy plain text → editor HTML (blank lines split paragraphs, newlines become <br>). */
export function plainTextToRichHtml(value: string): string {
  if (!value || isRichHtml(value)) return value ?? '';
  return value
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${inflateMarkdownBoldToHtml(escapeHtml(block)).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
