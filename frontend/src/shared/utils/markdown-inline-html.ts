import { isHtmlContent } from '@/shared/utils/html-content';
import { parseAssistantMarkdownBlocks, type AssistantMarkdownBlock } from '@/shared/utils/parse-assistant-markdown';

const BLOCK_TAGS =
  'p|div|br|hr|h[1-6]|ul|ol|li|table|colgroup|col|thead|tbody|tr|th|td|pre|blockquote|section|article|header|footer|nav|main|figure|figcaption';
const BLOCK_HTML_TAG = new RegExp(`<\\/?(?:${BLOCK_TAGS})(?:\\s[^>]*)?\\/?>`, 'i');
const LEADING_BLOCK_HTML_TAG = new RegExp(`^<\\/?(?:${BLOCK_TAGS})(?:\\s[^>]*)?\\/?>`, 'i');
const MARKDOWN_BLOCK_LINE = /^[ \t]*(?:[-*+]|\d+\.|#{1,6})[ \t]+\S/m;

/**
 * Markdown laid out in lines (paragraphs, `- ` bullets) that also carries HTML:
 * inline tags such as `<mark>` / `<strong>`, or a whole `<p>…</p>` line. Rendered
 * as HTML its newlines collapse into one paragraph; the markdown renderer would
 * drop the tags.
 */
export function isMarkdownWithInlineHtml(text: string): boolean {
  return isHtmlContent(text) && (!BLOCK_HTML_TAG.test(text) || MARKDOWN_BLOCK_LINE.test(text));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdownToHtml(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_m, code: string) => `<code>${escapeHtml(code)}</code>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(\S(?:[^*\n]*\S)?)\*(?!\*)/g, '$1<em>$2</em>');
}

function blockToHtml(block: AssistantMarkdownBlock): string {
  switch (block.type) {
    case 'heading':
      return `<h${block.level}>${inlineMarkdownToHtml(block.text)}</h${block.level}>`;
    case 'blockquote':
      return `<blockquote><p>${inlineMarkdownToHtml(block.text)}</p></blockquote>`;
    case 'code':
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case 'table': {
      const head = block.headers.map((cell) => `<th>${inlineMarkdownToHtml(cell)}</th>`).join('');
      const rows = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdownToHtml(cell)}</td>`).join('')}</tr>`)
        .join('');
      return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    default:
      if (LEADING_BLOCK_HTML_TAG.test(block.text)) return inlineMarkdownToHtml(block.text);
      return `<p>${inlineMarkdownToHtml(block.text)}</p>`;
  }
}

type OpenList = { tag: 'ul' | 'ol'; items: string[]; start: number };

/** Convert markdown blocks to HTML while keeping inline tags (`<mark>`, `<strong>`) intact. */
export function markdownWithInlineHtmlToHtml(text: string): string {
  const parts: string[] = [];
  let list = null as OpenList | null;
  const flushList = () => {
    if (!list) return;
    const start = list.tag === 'ol' && list.start !== 1 ? ` start="${list.start}"` : '';
    parts.push(`<${list.tag}${start}>${list.items.join('')}</${list.tag}>`);
    list = null;
  };

  for (const block of parseAssistantMarkdownBlocks(text)) {
    if (block.type === 'bullet' || block.type === 'ordered') {
      const tag = block.type === 'bullet' ? 'ul' : 'ol';
      if (list?.tag !== tag) {
        flushList();
        list = { tag, items: [], start: block.type === 'ordered' ? block.index : 1 };
      }
      list.items.push(`<li>${inlineMarkdownToHtml(block.text)}</li>`);
      continue;
    }
    flushList();
    parts.push(blockToHtml(block));
  }
  flushList();
  return parts.join('');
}
