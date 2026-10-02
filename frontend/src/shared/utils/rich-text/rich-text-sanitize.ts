import {
  RICH_TEXT_ALLOWED_ATTRS,
  RICH_TEXT_ALLOWED_TAGS,
  filterRichTextStyle,
  isAllowedRichTextClass,
  isSafeRichTextHref,
} from '@/shared/utils/rich-text/rich-text-schema';

const TAGS = new Set<string>(RICH_TEXT_ALLOWED_TAGS);
const ATTRS = new Set<string>(RICH_TEXT_ALLOWED_ATTRS);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;

function cleanAttributes(raw: string): string {
  const kept: string[] = [];
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(raw)) !== null) {
    const name = match[1].toLowerCase();
    if (!ATTRS.has(name) || name === 'rel') continue;
    let value = (match[2] ?? '').replace(/^["']|["']$/g, '');
    if (name === 'class') value = value.split(/\s+/).filter(isAllowedRichTextClass).join(' ');
    if (name === 'style') value = filterRichTextStyle(value);
    if (name === 'href' && !isSafeRichTextHref(value)) continue;
    if (!value) continue;
    kept.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  }
  if (kept.includes('target="_blank"')) kept.push('rel="noopener noreferrer"');
  return kept.join(' ');
}

/**
 * Native fallback (no DOM). Native never injects HTML — AppHtmlBody parses it —
 * so this only needs to keep stored values tidy before they reach the API.
 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return '';
  return html.replace(DROP_WITH_CONTENT, '').replace(/<!--[\s\S]*?-->/g, '').replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g,
    (_full, slash: string, tag: string, attrs: string) => {
      const name = tag.toLowerCase();
      if (!TAGS.has(name)) return '';
      if (slash) return `</${name}>`;
      const cleaned = cleanAttributes(attrs);
      return cleaned ? `<${name} ${cleaned}>` : `<${name}>`;
    },
  );
}
