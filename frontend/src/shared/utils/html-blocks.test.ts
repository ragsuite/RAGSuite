import { htmlToPlainText, parseHtmlContent, parseInlineHtml } from '@/shared/utils/html-content';

describe('parseHtmlContent', () => {
  it('keeps legacy answer shapes (h2/h3, paragraphs, bullets)', () => {
    const blocks = parseHtmlContent('<h2>Title</h2><p>Intro <strong>bold</strong></p><ul><li>One</li><li>Two</li></ul>');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bullet', 'bullet']);
    expect(blocks[0]).toMatchObject({ level: 2 });
    expect(blocks[2]).toMatchObject({ depth: 1, marker: '•' });
  });

  it('parses editor output: nested and ordered lists, quotes, rules, alignment, indent', () => {
    const html =
      '<h4 style="text-align: center">Steps</h4>' +
      '<ol start="3"><li><p>First</p><ul><li><p>Nested</p></li></ul></li><li><p>Second</p></li></ol>' +
      '<blockquote><p>Quoted</p></blockquote><hr><p class="rs-indent-2" style="text-align: right">Right</p>';
    const blocks = parseHtmlContent(html);
    expect(blocks).toEqual([
      { type: 'heading', level: 4, align: 'center', inline: [{ text: 'Steps' }] },
      { type: 'bullet', depth: 1, marker: '3.', inline: [{ text: 'First' }] },
      { type: 'bullet', depth: 2, marker: '◦', inline: [{ text: 'Nested' }] },
      { type: 'bullet', depth: 1, marker: '4.', inline: [{ text: 'Second' }] },
      { type: 'paragraph', quote: 1, inline: [{ text: 'Quoted' }] },
      { type: 'rule' },
      { type: 'paragraph', align: 'right', indent: 2, inline: [{ text: 'Right' }] },
    ]);
  });

  it('parses tables with header rows and paragraph cells', () => {
    const blocks = parseHtmlContent(
      '<table><tbody><tr><th><p>Plan</p></th><th><p>Price</p></th></tr><tr><td><p>CE</p></td><td><p>Free</p></td></tr></tbody></table>',
    );
    expect(blocks).toEqual([
      {
        type: 'table',
        rows: [
          { header: true, cells: [[{ text: 'Plan' }], [{ text: 'Price' }]] },
          { header: false, cells: [[{ text: 'CE' }], [{ text: 'Free' }]] },
        ],
      },
    ]);
    expect(htmlToPlainText('<table><tr><td>a</td><td>b</td></tr></table>')).toBe('a | b');
  });

  it('keeps loose text and drops script content', () => {
    expect(parseHtmlContent('Hello <b>world</b><script>alert(1)</script>')).toEqual([
      { type: 'paragraph', inline: [{ text: 'Hello ' }, { text: 'world', bold: true }] },
    ]);
  });
});

describe('parseInlineHtml', () => {
  it('handles sub/sup, code, safe links and soft hyphens', () => {
    expect(parseInlineHtml('H<sub>2</sub>O x<sup>2</sup> <code>npm</code>')).toEqual([
      { text: 'H' },
      { text: '2', script: 'sub' },
      { text: 'O x' },
      { text: '2', script: 'sup' },
      { text: ' ' },
      { text: 'npm', code: true },
    ]);
    expect(parseInlineHtml('<a href="https://x.io">ok</a><a href="javascript:alert(1)">bad</a>')).toEqual([
      { text: 'ok', href: 'https://x.io' },
      { text: 'bad' },
    ]);
    expect(parseInlineHtml('co&shy;op &amp;lt;')).toEqual([{ text: 'co\u00ADop &lt;' }]);
    expect(htmlToPlainText('<p>co&shy;op</p>')).toBe('coop');
  });
});
