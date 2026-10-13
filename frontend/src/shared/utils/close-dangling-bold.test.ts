import { closeDanglingBold } from '@/shared/utils/close-dangling-bold';

describe('closeDanglingBold', () => {
  it('closes a bold left open at the end of a line', () => {
    const text = '- **Ecoline:** **11.10.08.54**\n- **Highline:** **11.10.07.44';
    expect(closeDanglingBold(text)).toBe(
      '- **Ecoline:** **11.10.08.54**\n- **Highline:** **11.10.07.44**',
    );
  });

  it('closes each line on its own and keeps trailing spaces after the marker', () => {
    expect(closeDanglingBold('**a\n**b**  ')).toBe('**a**\n**b**  ');
    expect(closeDanglingBold('**x  ')).toBe('**x**  ');
  });

  it('leaves balanced lines, a marker followed by a space, tables and code untouched', () => {
    const untouched = [
      '- **Highline:** **11.10.07.44**',
      'a ** b',
      '| **x | y |',
      '```',
      'const s = "**open";',
      '```',
    ].join('\n');
    expect(closeDanglingBold(untouched)).toBe(untouched);
  });
});
