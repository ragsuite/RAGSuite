import {
  consumeTableSeparator,
  isPipeTableRow,
  isPipeTableSeparator,
  isSeparatorOnlyLine,
  parseAssistantMarkdownBlocks,
  splitPipeTableCells,
  tryParseTableAt,
} from '@/shared/utils/parse-assistant-markdown';

describe('parseAssistantMarkdownBlocks tables', () => {
  const sample = [
    '## Key Differentiators vs. Competitors',
    '',
    '| Feature | FinSense AI | Walnut | Fi Money | CRED |',
    '|---|---|---|---|---|',
    '| AI explains spending | ✅ Yes | ❌ No | ⚠️ Partial | ❌ No |',
    '| Conversational AI | ✅ Yes | ❌ No | ❌ No | ❌ No |',
    '',
    '### After',
  ].join('\n');

  it('detects GFM separator rows', () => {
    expect(isPipeTableSeparator('|---|---|---|')).toBe(true);
    expect(isPipeTableSeparator('| --- | :---: | ---: |')).toBe(true);
    expect(isPipeTableSeparator('| Feature | A |')).toBe(false);
    expect(isSeparatorOnlyLine('|---|')).toBe(true);
  });

  it('splits pipe cells', () => {
    expect(splitPipeTableCells('| A | B | C |')).toEqual(['A', 'B', 'C']);
    expect(isPipeTableRow('| A | B |')).toBe(true);
  });

  it('parses a markdown table into a table block', () => {
    const blocks = parseAssistantMarkdownBlocks(sample);
    const table = blocks.find((b) => b.type === 'table');
    expect(table).toBeDefined();
    if (!table || table.type !== 'table') throw new Error('expected table');
    expect(table.headers).toEqual(['Feature', 'FinSense AI', 'Walnut', 'Fi Money', 'CRED']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.[0]).toBe('AI explains spending');
    expect(table.rows[1]?.[1]).toContain('Yes');
  });

  it('parses tables when separator is fragmented across lines (LLM quirk)', () => {
    const md = [
      '| Capability | FinSense AI | Walnut | Fi Money | CRED |',
      '|---|',
      '|---|',
      '|---|',
      '|---|',
      '| AI Explains Spending | ✅ Yes | ❌ No | ⚠️ Partial | ❌ No |',
      '| Conversational AI Chat | ✅ Yes | ❌ No | ❌ No | ❌ No |',
    ].join('\n');
    const blocks = parseAssistantMarkdownBlocks(md);
    const table = blocks.find((b) => b.type === 'table');
    expect(table).toBeDefined();
    if (!table || table.type !== 'table') throw new Error('expected table');
    expect(table.headers[0]).toBe('Capability');
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.[0]).toBe('AI Explains Spending');
  });

  it('parses tables with blank lines around the separator', () => {
    const md = [
      '| A | B | C |',
      '',
      '| --- | --- | --- |',
      '',
      '| 1 | 2 | 3 |',
    ].join('\n');
    const table = parseAssistantMarkdownBlocks(md).find((b) => b.type === 'table');
    expect(table).toBeDefined();
    if (!table || table.type !== 'table') throw new Error('expected table');
    expect(table.rows).toEqual([['1', '2', '3']]);
  });

  it('merges soft-wrapped body rows', () => {
    const md = [
      '| Feature | A | B | C |',
      '|---|---|---|---|',
      '| Long feature name | ✅ Yes',
      '| ❌ No | ⚠️ Partial |',
    ].join('\n');
    const table = parseAssistantMarkdownBlocks(md).find((b) => b.type === 'table');
    expect(table).toBeDefined();
    if (!table || table.type !== 'table') throw new Error('expected table');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toEqual(['Long feature name', '✅ Yes', '❌ No', '⚠️ Partial']);
  });

  it('consumeTableSeparator advances past fragments', () => {
    const lines = ['| A | B | C |', '|---|', '|---|', '| 1 | 2 | 3 |'];
    expect(consumeTableSeparator(lines, 1, 3)).toBe(3);
    expect(tryParseTableAt(lines, 0)?.block.rows).toEqual([['1', '2', '3']]);
  });

  it('does not treat lone pipe paragraphs as tables without separator', () => {
    const blocks = parseAssistantMarkdownBlocks('| not a table | still text |');
    expect(blocks.every((b) => b.type !== 'table')).toBe(true);
    expect(blocks.some((b) => b.type === 'paragraph')).toBe(true);
  });

  it('keeps code fences from becoming tables', () => {
    const md = ['```', '| a | b |', '|---|---|', '| 1 | 2 |', '```'].join('\n');
    const blocks = parseAssistantMarkdownBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('code');
  });
});
