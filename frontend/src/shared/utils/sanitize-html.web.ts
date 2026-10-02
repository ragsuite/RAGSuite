import DOMPurify from 'dompurify';

const DISPLAY_ROOT_ATTR = 'data-rs-display';
let displayHooksInstalled = false;

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}

function installDisplayHooks() {
  if (displayHooksInstalled) return;
  displayHooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName !== 'A' || !node.closest(`[${DISPLAY_ROOT_ATTR}]`)) return;
    if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
  });
}

/**
 * XSS guard for rendered answers (assistant HTML, FAQ answers, textual sources).
 * Keeps DOMPurify's broad safe profile (classes, data attributes, citation
 * links) so existing answer markup renders unchanged; also drops embedded
 * styles and form controls that could restyle or spoof the host page.
 */
export function sanitizeDisplayHtml(html: string): string {
  if (!html) return '';
  installDisplayHooks();
  const wrapped = DOMPurify.sanitize(`<div ${DISPLAY_ROOT_ATTR}="1">${html}</div>`, {
    ADD_ATTR: ['target', DISPLAY_ROOT_ATTR],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    RETURN_DOM: true,
  }) as HTMLElement;
  const root = wrapped.querySelector(`[${DISPLAY_ROOT_ATTR}]`) ?? wrapped;
  return root.innerHTML;
}
