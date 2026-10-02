import DOMPurify from 'dompurify';

import {
  RICH_TEXT_ALLOWED_ATTRS,
  RICH_TEXT_ALLOWED_TAGS,
  filterRichTextStyle,
  isAllowedRichTextClass,
  isSafeRichTextHref,
} from '@/shared/utils/rich-text/rich-text-schema';

let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (!node.closest('[data-rs-rich]')) return;
    const name = data.attrName;
    if (name === 'class') {
      const kept = data.attrValue.split(/\s+/).filter(isAllowedRichTextClass).join(' ');
      if (kept) data.attrValue = kept;
      else data.keepAttr = false;
    } else if (name === 'style') {
      const kept = filterRichTextStyle(data.attrValue);
      if (kept) data.attrValue = kept;
      else data.keepAttr = false;
    } else if (name === 'href' && !isSafeRichTextHref(data.attrValue)) {
      data.keepAttr = false;
    }
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName !== 'A' || !node.closest('[data-rs-rich]')) return;
    if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
    else node.removeAttribute('rel');
  });
}

/** Allowlist sanitizer for editor HTML (web / DOM component runtime). */
export function sanitizeRichHtml(html: string): string {
  if (!html) return '';
  installHooks();
  const wrapped = DOMPurify.sanitize(`<div data-rs-rich="1">${html}</div>`, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS, 'div'],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTRS, 'data-rs-rich'],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM: true,
  }) as HTMLElement;
  const root = wrapped.querySelector('[data-rs-rich]') ?? wrapped;
  return root.innerHTML;
}
