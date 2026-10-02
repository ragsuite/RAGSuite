/**
 * @jest-environment jsdom
 */
import { sanitizeDisplayHtml } from '@/shared/utils/sanitize-html.web';

describe('sanitizeDisplayHtml', () => {
  it('keeps rich editor markup used by FAQ answers and textual sources', () => {
    const html =
      '<h2>Refund</h2><p class="rs-indent-1" style="text-align: center;"><strong>Full</strong> <mark>refund</mark> H<sub>2</sub>O</p>' +
      '<ul><li><p>One</p></li></ul><blockquote><p>Quote</p></blockquote><hr>' +
      '<table><tbody><tr><th><p>Plan</p></th></tr><tr><td><p>Basic</p></td></tr></tbody></table>';
    const out = sanitizeDisplayHtml(html);
    expect(out).toContain('<h2>Refund</h2>');
    expect(out).toContain('class="rs-indent-1"');
    expect(out).toContain('text-align: center;');
    expect(out).toContain('<mark>refund</mark>');
    expect(out).toContain('<sub>2</sub>');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<th><p>Plan</p></th>');
  });

  it('strips scripts, handlers, embedded styles and form controls', () => {
    const out = sanitizeDisplayHtml(
      '<p onclick="x()">Hi<script>alert(1)</script></p><style>body{display:none}</style><form><input value="a"></form><a href="javascript:alert(1)">bad</a>',
    );
    expect(out).not.toMatch(/script|onclick|<style|<form|<input|javascript:/i);
    expect(out).toContain('<p>Hi</p>');
  });

  it('adds rel to links that open a new tab', () => {
    const out = sanitizeDisplayHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeDisplayHtml('')).toBe('');
  });
});
