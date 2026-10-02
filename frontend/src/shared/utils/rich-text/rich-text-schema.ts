/**
 * Single allowlist for rich text (FAQ answers, Text / Q&A sources).
 * Mirrored by backend/app/services/rich_text.py — keep both in sync.
 */
export const RICH_TEXT_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'sub',
  'sup',
  'code',
  'pre',
  'mark',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
  'table',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
] as const;

export const RICH_TEXT_ALLOWED_ATTRS = [
  'href',
  'target',
  'rel',
  'class',
  'style',
  'colspan',
  'rowspan',
  'start',
] as const;

/** Only these inline style properties survive sanitization. */
export const RICH_TEXT_ALLOWED_STYLE_PROPS = ['text-align', 'width', 'min-width'] as const;

export const RICH_TEXT_LINK_PROTOCOLS = ['http', 'https', 'mailto', 'tel'] as const;

/** Classes produced by the Styles menu and indent control. */
export const RICH_TEXT_STYLE_CLASSES = ['rs-lead', 'rs-small', 'rs-muted'] as const;
export const RICH_TEXT_MAX_INDENT = 6;
export const RICH_TEXT_INDENT_CLASS_PREFIX = 'rs-indent-';

export type RichTextStyleClass = (typeof RICH_TEXT_STYLE_CLASSES)[number];

export function isAllowedRichTextClass(value: string): boolean {
  if ((RICH_TEXT_STYLE_CLASSES as readonly string[]).includes(value)) return true;
  const match = value.match(/^rs-indent-(\d)$/);
  return Boolean(match && Number(match[1]) >= 1 && Number(match[1]) <= RICH_TEXT_MAX_INDENT);
}

export function isSafeRichTextHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (value.startsWith('#') || value.startsWith('/')) return true;
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!scheme) return false;
  return (RICH_TEXT_LINK_PROTOCOLS as readonly string[]).includes(scheme[1].toLowerCase());
}

/** Keep only allowlisted declarations, e.g. `text-align: center`. */
export function filterRichTextStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const [prop, ...rest] = part.split(':');
      if (!prop || rest.length === 0) return false;
      const name = prop.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (!(RICH_TEXT_ALLOWED_STYLE_PROPS as readonly string[]).includes(name)) return false;
      return /^[a-z0-9.%\s-]+$/i.test(value);
    })
    .join('; ');
}
