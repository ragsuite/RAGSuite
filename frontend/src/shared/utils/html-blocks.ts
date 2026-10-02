import {
  inlinePlainText,
  parseInlineHtml,
  trimInlineNodes,
  type HtmlInlineNode,
} from '@/shared/utils/html-inline';

export type HtmlTextAlign = 'left' | 'center' | 'right' | 'justify';

type BlockLayout = { align?: HtmlTextAlign; indent?: number; quote?: number };

export type HtmlTableRow = { header: boolean; cells: HtmlInlineNode[][] };

export type HtmlContentBlock =
  | ({ type: 'heading'; level: 1 | 2 | 3 | 4; inline: HtmlInlineNode[] } & BlockLayout)
  | ({ type: 'paragraph'; inline: HtmlInlineNode[]; preformatted?: boolean } & BlockLayout)
  | ({ type: 'bullet'; inline: HtmlInlineNode[]; depth: number; marker: string } & BlockLayout)
  | { type: 'rule'; quote?: number }
  | { type: 'table'; rows: HtmlTableRow[]; quote?: number };

const TOKEN_RE = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+|</g;
const PARAGRAPH_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'figure', 'figcaption', 'caption']);
const SKIP_CONTENT_TAGS = new Set(['script', 'style', 'template', 'noscript']);
const BULLETS = ['•', '◦', '▪'];

function readLayout(attrs: string): Pick<BlockLayout, 'align' | 'indent'> {
  const align = attrs.match(/text-align\s*:\s*(left|center|right|justify)/i)?.[1]?.toLowerCase() as HtmlTextAlign | undefined;
  const indent = Number(attrs.match(/\brs-indent-(\d)\b/)?.[1] ?? 0);
  return { ...(align && align !== 'left' ? { align } : null), ...(indent > 0 ? { indent } : null) };
}

function quoteLayout(quote: number): Pick<BlockLayout, 'quote'> {
  return quote > 0 ? { quote } : {};
}

/** Parses answer / rich-text HTML into native-renderable blocks (headings, nested lists, quotes, tables). */
export function parseHtmlContent(html: string): HtmlContentBlock[] {
  const blocks: HtmlContentBlock[] = [];
  const lists: { ordered: boolean; n: number }[] = [];
  let buffer = '';
  let openItems = 0;
  let pendingMarker: string | null = null;
  let heading: 1 | 2 | 3 | 4 | null = null;
  let layout: Pick<BlockLayout, 'align' | 'indent'> = {};
  let pre = 0;
  let quote = 0;
  let skipUntil: string | null = null;
  let table: HtmlTableRow[] | null = null;
  let row: HtmlTableRow | null = null;
  let cellOpen = false;

  const flush = () => {
    if (cellOpen) return;
    const inline = trimInlineNodes(parseInlineHtml(buffer));
    buffer = '';
    if (!inlinePlainText(inline)) return;
    const quoted = quoteLayout(quote);
    if (heading) blocks.push({ type: 'heading', level: heading, inline, ...layout, ...quoted });
    else if (openItems > 0 && lists.length > 0) {
      blocks.push({ type: 'bullet', inline, depth: lists.length, marker: pendingMarker ?? '', ...quoted });
      pendingMarker = null;
    } else blocks.push({ type: 'paragraph', inline, ...(pre ? { preformatted: true } : null), ...layout, ...quoted });
  };

  for (const match of html.matchAll(TOKEN_RE)) {
    const token = match[0];
    const tag = match[1]?.toLowerCase();
    if (token.startsWith('<!--')) continue;
    if (skipUntil) {
      if (tag === skipUntil && token.startsWith('</')) skipUntil = null;
      continue;
    }
    if (!tag) {
      buffer += pre ? token : token.replace(/[\t\n\r ]+/g, ' ');
      continue;
    }
    const closing = token.startsWith('</');
    const attrs = match[2] ?? '';
    if (SKIP_CONTENT_TAGS.has(tag)) {
      if (!closing && !token.endsWith('/>')) skipUntil = tag;
      continue;
    }
    if (tag === 'br') {
      buffer += '\n';
      continue;
    }

    if (cellOpen && tag !== 'td' && tag !== 'th' && tag !== 'tr' && tag !== 'table') {
      if (closing && (PARAGRAPH_TAGS.has(tag) || tag === 'li' || /^h[1-6]$/.test(tag))) buffer += '\n';
      else if (!PARAGRAPH_TAGS.has(tag)) buffer += token;
      continue;
    }

    if (/^h[1-6]$/.test(tag)) {
      flush();
      heading = closing ? null : (Math.min(4, Number(tag[1])) as 1 | 2 | 3 | 4);
      layout = closing ? {} : readLayout(attrs);
    } else if (PARAGRAPH_TAGS.has(tag)) {
      flush();
      layout = closing ? {} : readLayout(attrs);
    } else if (tag === 'pre') {
      flush();
      pre = Math.max(0, pre + (closing ? -1 : 1));
    } else if (tag === 'blockquote') {
      flush();
      quote = Math.max(0, quote + (closing ? -1 : 1));
    } else if (tag === 'ul' || tag === 'ol') {
      flush();
      if (closing) lists.pop();
      else lists.push({ ordered: tag === 'ol', n: Math.max(0, Number(attrs.match(/\bstart\s*=\s*["']?(\d+)/i)?.[1] ?? 1) - 1) });
    } else if (tag === 'li') {
      flush();
      if (closing) {
        openItems = Math.max(0, openItems - 1);
        pendingMarker = null;
      } else {
        openItems += 1;
        const list = lists[lists.length - 1];
        if (list) {
          list.n += 1;
          pendingMarker = list.ordered ? `${list.n}.` : BULLETS[Math.min(lists.length, BULLETS.length) - 1];
        }
      }
    } else if (tag === 'hr') {
      flush();
      blocks.push({ type: 'rule', ...quoteLayout(quote) });
    } else if (tag === 'table') {
      flush();
      if (closing && table) {
        if (table.length) blocks.push({ type: 'table', rows: table, ...quoteLayout(quote) });
        table = null;
      } else if (!closing) table = [];
    } else if (tag === 'tr' && table) {
      if (closing && row) {
        if (row.cells.length) table.push(row);
        row = null;
      } else if (!closing) row = { header: false, cells: [] };
    } else if ((tag === 'td' || tag === 'th') && row) {
      if (closing && cellOpen) {
        cellOpen = false;
        row.cells.push(trimInlineNodes(parseInlineHtml(buffer.replace(/\n+$/, ''))));
        buffer = '';
      } else if (!closing) {
        cellOpen = true;
        buffer = '';
        if (tag === 'th') row.header = true;
      }
    } else if (!['thead', 'tbody', 'tfoot', 'colgroup', 'col', 'tr', 'td', 'th'].includes(tag)) {
      buffer += token;
    }
  }
  cellOpen = false;
  flush();

  if (blocks.length === 0) {
    const plain = inlinePlainText(parseInlineHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')));
    if (plain) blocks.push({ type: 'paragraph', inline: [{ text: plain }] });
  }
  return blocks;
}

function blockPlainText(block: HtmlContentBlock): string {
  switch (block.type) {
    case 'rule':
      return '';
    case 'table':
      return block.rows.map((r) => r.cells.map(inlinePlainText).join(' | ')).join('\n');
    case 'bullet': {
      const text = inlinePlainText(block.inline);
      const marker = block.marker ? `${block.marker} ` : '  ';
      return `${'  '.repeat(block.depth - 1)}${marker}${text}`;
    }
    default:
      return inlinePlainText(block.inline);
  }
}

export function blocksToPlainText(blocks: HtmlContentBlock[]): string {
  return blocks.map(blockPlainText).filter(Boolean).join('\n\n').trim();
}
