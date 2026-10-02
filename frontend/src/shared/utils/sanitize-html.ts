/** Lightweight HTML sanitization for native — avoids jsdom/DOMPurify. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

/** Native renders HTML through the RN block parser (never innerHTML); parity export for shared imports. */
export function sanitizeDisplayHtml(html: string): string {
  return sanitizeHtml(html);
}
