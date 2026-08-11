export type HtmlInlineNode = { text: string; bold?: boolean; italic?: boolean };

export type HtmlContentBlock =
  | { type: 'heading'; level: 2 | 3; inline: HtmlInlineNode[] }
  | { type: 'paragraph'; inline: HtmlInlineNode[] }
  | { type: 'bullet'; inline: HtmlInlineNode[] };

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function isHtmlContent(text: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(text.trim());
}

function mergeInlineNodes(nodes: HtmlInlineNode[]): HtmlInlineNode[] {
  const merged: HtmlInlineNode[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (last && last.bold === node.bold && last.italic === node.italic) {
      last.text += node.text;
      continue;
    }
    if (node.text) merged.push(node);
  }
  return merged;
}

export function parseInlineHtml(html: string): HtmlInlineNode[] {
  const nodes: HtmlInlineNode[] = [];
  let rest = html;

  while (rest.length > 0) {
    const strongMatch = rest.match(/^<(strong|b)[^>]*>([\s\S]*?)<\/\1>/i);
    if (strongMatch) {
      nodes.push(
        ...parseInlineHtml(strongMatch[2]).map((node) => ({
          ...node,
          bold: true,
        })),
      );
      rest = rest.slice(strongMatch[0].length);
      continue;
    }

    const emMatch = rest.match(/^<(em|i)[^>]*>([\s\S]*?)<\/\1>/i);
    if (emMatch) {
      nodes.push(
        ...parseInlineHtml(emMatch[2]).map((node) => ({
          ...node,
          italic: true,
        })),
      );
      rest = rest.slice(emMatch[0].length);
      continue;
    }

    const tagMatch = rest.match(/^<[^>]+>/);
    if (tagMatch) {
      rest = rest.slice(tagMatch[0].length);
      continue;
    }

    const textMatch = rest.match(/^[^<]+/);
    if (textMatch) {
      nodes.push({ text: decodeHtmlEntities(textMatch[0]) });
      rest = rest.slice(textMatch[0].length);
      continue;
    }

    break;
  }

  return mergeInlineNodes(nodes);
}

function inlinePlainText(inline: HtmlInlineNode[]): string {
  return inline.map((node) => node.text).join('').trim();
}

export function parseHtmlContent(html: string): HtmlContentBlock[] {
  const blocks: HtmlContentBlock[] = [];
  const normalized = html.replace(/<br\s*\/?>/gi, '\n').trim();
  if (!normalized) return blocks;

  const blockRegex = /<(h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = blockRegex.exec(normalized)) !== null) {
    const tag = match[1].toLowerCase();
    const inline = parseInlineHtml(match[2]);
    if (!inlinePlainText(inline)) continue;

    if (tag === 'h2') blocks.push({ type: 'heading', level: 2, inline });
    else if (tag === 'h3') blocks.push({ type: 'heading', level: 3, inline });
    else if (tag === 'li') blocks.push({ type: 'bullet', inline });
    else blocks.push({ type: 'paragraph', inline });
  }

  if (blocks.length === 0) {
    const plain = decodeHtmlEntities(normalized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
    if (plain) blocks.push({ type: 'paragraph', inline: [{ text: plain }] });
  }

  return blocks;
}

export function htmlToPlainText(html: string): string {
  if (!isHtmlContent(html)) return html.trim();

  const blocks = parseHtmlContent(html);
  if (blocks.length > 0) {
    return blocks
      .map((block) => {
        const text = inlinePlainText(block.inline);
        if (block.type === 'bullet') return `• ${text}`;
        return text;
      })
      .join('\n\n')
      .trim();
  }

  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

export function getRenderablePlainText(content: string): string {
  if (!content.trim()) return '';
  return isHtmlContent(content) ? htmlToPlainText(content) : content.trim();
}
