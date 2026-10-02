export type HtmlInlineNode = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Soft answer-span highlight from <mark> (distinct from TTS speech highlight). */
  highlight?: boolean;
  code?: boolean;
  script?: 'sub' | 'sup';
  href?: string;
};

type InlineFlags = Omit<HtmlInlineNode, 'text'>;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  shy: '\u00AD',
};

/** Single-pass decode so `&amp;lt;` stays `&lt;` instead of becoming `<`. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

function sameFlags(a: HtmlInlineNode, b: HtmlInlineNode): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.highlight === b.highlight &&
    a.code === b.code &&
    a.script === b.script &&
    a.href === b.href
  );
}

function mergeInlineNodes(nodes: HtmlInlineNode[]): HtmlInlineNode[] {
  const merged: HtmlInlineNode[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (last && sameFlags(last, node)) {
      last.text += node.text;
      continue;
    }
    if (node.text) merged.push(node);
  }
  return merged;
}

function readHref(attrs: string): string | undefined {
  const match = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const href = decodeHtmlEntities((match?.[1] ?? match?.[2] ?? '').trim());
  return href && /^(https?:|mailto:|tel:|\/)/i.test(href) ? href : undefined;
}

type InlineRule = { pattern: RegExp; flags: (match: RegExpMatchArray) => InlineFlags; body: number };

const INLINE_RULES: InlineRule[] = [
  { pattern: /^<mark\b[^>]*>([\s\S]*?)<\/mark>/i, flags: () => ({ highlight: true }), body: 1 },
  { pattern: /^<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i, flags: () => ({ bold: true }), body: 2 },
  { pattern: /^<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/i, flags: () => ({ italic: true }), body: 2 },
  { pattern: /^<a\b([^>]*)>([\s\S]*?)<\/a>/i, flags: (m) => ({ href: readHref(m[1]) }), body: 2 },
  { pattern: /^<(sub|sup)\b[^>]*>([\s\S]*?)<\/\1>/i, flags: (m) => ({ script: m[1].toLowerCase() as 'sub' | 'sup' }), body: 2 },
  { pattern: /^<code\b[^>]*>([\s\S]*?)<\/code>/i, flags: () => ({ code: true }), body: 1 },
];

export function parseInlineHtml(html: string): HtmlInlineNode[] {
  const nodes: HtmlInlineNode[] = [];
  let rest = html;

  outer: while (rest.length > 0) {
    for (const rule of INLINE_RULES) {
      const match = rest.match(rule.pattern);
      if (!match) continue;
      const flags = pickDefined(rule.flags(match));
      nodes.push(...parseInlineHtml(match[rule.body]).map((node) => ({ ...node, ...flags })));
      rest = rest.slice(match[0].length);
      continue outer;
    }

    const tagMatch = rest.match(/^<[^>]+>/);
    if (tagMatch) {
      rest = rest.slice(tagMatch[0].length);
      continue;
    }

    const textMatch = rest.match(/^[^<]+/) ?? rest.match(/^</);
    if (!textMatch) break;
    nodes.push({ text: decodeHtmlEntities(textMatch[0]) });
    rest = rest.slice(textMatch[0].length);
  }

  return mergeInlineNodes(nodes);
}

/** Outer tags add their flags; an unsafe/missing href must not erase an inner one. */
function pickDefined(flags: InlineFlags): InlineFlags {
  return Object.fromEntries(Object.entries(flags).filter(([, value]) => value !== undefined)) as InlineFlags;
}

export function inlinePlainText(inline: HtmlInlineNode[]): string {
  return inline.map((node) => node.text).join('').replace(/\u00AD/g, '').trim();
}

/** Trim leading/trailing whitespace across the node list (block boundaries). */
export function trimInlineNodes(inline: HtmlInlineNode[]): HtmlInlineNode[] {
  const nodes = inline.map((node) => ({ ...node }));
  while (nodes.length && !(nodes[0].text = nodes[0].text.replace(/^\s+/, ''))) nodes.shift();
  while (nodes.length) {
    const last = nodes[nodes.length - 1];
    last.text = last.text.replace(/\s+$/, '');
    if (last.text) break;
    nodes.pop();
  }
  return nodes;
}
