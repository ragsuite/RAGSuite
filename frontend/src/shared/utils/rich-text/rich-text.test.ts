import {
  filterRichTextStyle,
  isAllowedRichTextClass,
  isRichHtml,
  isRichTextEmpty,
  isSafeRichTextHref,
  plainTextToRichHtml,
  richHtmlToPlainText,
  richTextLength,
  sanitizeRichHtml,
} from '@/shared/utils/rich-text';

describe('rich text detection and length', () => {
  it('treats legacy plain text as non-rich', () => {
    expect(isRichHtml('Orders arrive in 3-5 days.')).toBe(false);
    expect(isRichHtml('<p>Hello</p>')).toBe(true);
    expect(isRichHtml('x<sup>2</sup>')).toBe(true);
  });

  it('counts visible characters only (tags, entities, soft hyphens, whitespace)', () => {
    expect(richTextLength('<p><strong>Hi</strong>&nbsp;there</p>')).toBe('Hi there'.length);
    expect(richTextLength('<p>Ver\u00ADsand</p>')).toBe('Versand'.length);
    expect(richTextLength('<p>a</p><p>b</p>')).toBe(3);
    expect(richTextLength('plain   text')).toBe('plain text'.length);
  });

  it('detects empty editor output', () => {
    expect(isRichTextEmpty('<p></p>')).toBe(true);
    expect(isRichTextEmpty('<p><br></p>')).toBe(true);
    expect(isRichTextEmpty('')).toBe(true);
    expect(isRichTextEmpty('<p>x</p>')).toBe(false);
  });
});

describe('plain text <-> rich html', () => {
  it('converts legacy plain text into escaped paragraphs', () => {
    expect(plainTextToRichHtml('Line 1\nLine 2\n\nA < B & C')).toBe(
      '<p>Line 1<br>Line 2</p><p>A &lt; B &amp; C</p>',
    );
  });

  it('shows legacy markdown bold as bold, matching the widget renderer', () => {
    expect(plainTextToRichHtml('**NITSAN** builds\n**TYPO3 & more**')).toBe(
      '<p><strong>NITSAN</strong> builds<br><strong>TYPO3 &amp; more</strong></p>',
    );
  });

  it('leaves rich html untouched', () => {
    expect(plainTextToRichHtml('<p>Hi</p>')).toBe('<p>Hi</p>');
  });

  it('renders readable plain text with bullets and table rows', () => {
    const html =
      '<h2>Shipping</h2><ul><li>Fast</li><li>Free</li></ul><table><tbody><tr><td>EU</td><td>3 days</td></tr></tbody></table>';
    expect(richHtmlToPlainText(html)).toBe('Shipping\n\n• Fast\n• Free\n\nEU | 3 days');
  });

  it('unwraps TipTap paragraphs inside list items and cells', () => {
    const html =
      '<ul><li><p>Fast</p></li><li><p>Free</p></li></ul><table><tbody><tr><th><p>Zone</p></th><th><p>Days</p></th></tr><tr><td><p>EU</p></td><td><p>3</p></td></tr></tbody></table>';
    expect(richHtmlToPlainText(html)).toBe('• Fast\n• Free\n\nZone | Days\nEU | 3');
  });
});

describe('sanitizeRichHtml (native fallback)', () => {
  it('drops scripts, event handlers and unsafe links', () => {
    const dirty =
      '<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror=alert(1)></p><a href="javascript:alert(1)">bad</a>';
    expect(sanitizeRichHtml(dirty)).toBe('<p>Hi</p><a>bad</a>');
  });

  it('keeps allowlisted markup, classes and styles', () => {
    const html =
      '<p style="text-align: center; color: red" class="rs-indent-2 evil">x<sub>2</sub></p><a href="https://a.b" target="_blank" rel="opener">l</a>';
    expect(sanitizeRichHtml(html)).toBe(
      '<p style="text-align: center" class="rs-indent-2">x<sub>2</sub></p><a href="https://a.b" target="_blank" rel="noopener noreferrer">l</a>',
    );
  });
});

describe('schema helpers', () => {
  it('validates link schemes', () => {
    expect(isSafeRichTextHref('https://ragsuite.de')).toBe(true);
    expect(isSafeRichTextHref('mailto:a@b.c')).toBe(true);
    expect(isSafeRichTextHref('javascript:alert(1)')).toBe(false);
    expect(isSafeRichTextHref('data:text/html,x')).toBe(false);
  });

  it('allows only known classes and style props', () => {
    expect(isAllowedRichTextClass('rs-lead')).toBe(true);
    expect(isAllowedRichTextClass('rs-indent-7')).toBe(false);
    expect(filterRichTextStyle('text-align: right; background: url(x)')).toBe('text-align: right');
  });
});
