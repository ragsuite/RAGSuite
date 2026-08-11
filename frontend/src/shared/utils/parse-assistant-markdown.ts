/**
 * Lightweight assistant markdown block parser (headings, lists, code, GFM tables).
 * Shared by chat widget, history, and search answer rendering.
 *
 * Table parsing is intentionally resilient to common LLM quirks:
 * - separator split across multiple `|---|` lines
 * - alignment markers (`:---`, `---:`, `:---:`)
 * - blank lines between header / separator / body
 * - soft-wrapped body rows continued on the next line(s)
 */

export type AssistantMarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'ordered'; index: number; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

export function isPipeTableRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes('|')) return false;
  const cells = splitPipeTableCells(t);
  return cells.length >= 2 && cells.some((c) => c.length > 0);
}

/** Classic single-line GFM separator: `| --- | :---: | ---: |` */
export function isPipeTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes('|') || !/-{2,}/.test(t)) return false;
  if (/[A-Za-z0-9]/.test(t)) return false;
  // GFM: | --- | :---: | ---: |
  return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(t);
}

/**
 * Line that only contributes separator syntax (possibly a fragment such as `|---|`).
 * Models often emit one fragment per column on its own line.
 */
export function isSeparatorOnlyLine(line: string): boolean {
  const t = line.trim();
  if (!t || !/-{2,}/.test(t)) return false;
  if (/[A-Za-z0-9*]/.test(t)) return false;
  return /^[\s|:\-]+$/.test(t);
}

export function splitPipeTableCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((cell) => cell.trim());
}

function stripHeadingMarkers(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .trim();
}

function skipBlankLines(lines: string[], start: number): number {
  let i = start;
  while (i < lines.length && !(lines[i] ?? '').trim()) i += 1;
  return i;
}

function countDashGroups(text: string): number {
  return text.match(/:?-{2,}:?/g)?.length ?? 0;
}

/**
 * After a header row, consume one or more separator-only lines (including
 * fragmented `|---|` per column) and return the index after them.
 */
export function consumeTableSeparator(lines: string[], start: number, headerColCount: number): number | null {
  let i = skipBlankLines(lines, start);
  if (i >= lines.length) return null;

  const first = (lines[i] ?? '').trim();
  if (isPipeTableSeparator(first)) {
    return i + 1;
  }

  if (!isSeparatorOnlyLine(first)) return null;

  const sepLines: string[] = [];
  while (i < lines.length && isSeparatorOnlyLine((lines[i] ?? '').trim())) {
    sepLines.push((lines[i] ?? '').trim());
    i += 1;
  }

  const dashGroups = countDashGroups(sepLines.join(''));
  // Accept if we got a classic separator, enough dash groups for the header,
  // or at least one separator fragment (LLM often under-counts columns).
  if (dashGroups >= 1 || sepLines.some(isPipeTableSeparator)) {
    // Prefer having roughly enough columns when many fragments exist
    if (sepLines.length >= 1 && (dashGroups >= Math.min(2, headerColCount) || headerColCount <= 2 || dashGroups >= 1)) {
      return i;
    }
  }
  return null;
}

function padCells(cells: string[], colCount: number): string[] {
  const padded = [...cells];
  while (padded.length < colCount) padded.push('');
  return padded.slice(0, colCount);
}

/**
 * Consume one logical table body row, merging soft-wrapped continuations when
 * the model splits a row across lines without finishing all columns.
 */
export function consumeTableBodyRow(
  lines: string[],
  start: number,
  colCount: number,
): { cells: string[]; nextIndex: number } | null {
  let i = skipBlankLines(lines, start);
  if (i >= lines.length) return null;

  const first = (lines[i] ?? '').trim();
  if (!first || isSeparatorOnlyLine(first) || !isPipeTableRow(first)) return null;

  let cells = splitPipeTableCells(first);
  i += 1;

  while (cells.length < colCount && i < lines.length) {
    const next = (lines[i] ?? '').trim();
    if (!next) break;
    if (isSeparatorOnlyLine(next)) break;

    // Continuation without a leading pipe — append to last cell
    if (!next.includes('|')) {
      const last = cells.length - 1;
      if (last >= 0) {
        cells[last] = `${cells[last]} ${next}`.trim();
      }
      i += 1;
      continue;
    }

    if (!isPipeTableRow(next)) break;
    const more = splitPipeTableCells(next);
    // A full-width row is a new record, not a wrap continuation
    if (more.length >= colCount) break;
    cells = [...cells, ...more];
    i += 1;
  }

  return { cells: padCells(cells, colCount), nextIndex: i };
}

type TableParseResult = {
  block: Extract<AssistantMarkdownBlock, { type: 'table' }>;
  nextIndex: number;
};

export function tryParseTableAt(lines: string[], start: number): TableParseResult | null {
  const headerLine = (lines[start] ?? '').trim();
  if (!isPipeTableRow(headerLine)) return null;

  const headers = splitPipeTableCells(headerLine);
  if (headers.length < 2) return null;

  const afterSep = consumeTableSeparator(lines, start + 1, headers.length);
  if (afterSep == null) return null;

  const rows: string[][] = [];
  let i = afterSep;
  while (i < lines.length) {
    const row = consumeTableBodyRow(lines, i, headers.length);
    if (!row) break;
    rows.push(row.cells);
    i = row.nextIndex;
  }

  return {
    block: { type: 'table', headers, rows },
    nextIndex: i,
  };
}

/**
 * Parse markdown into display blocks. Tables are detected line-wise across the
 * full document (not only within `\n\n` paragraphs) so blank lines / broken
 * separators from models still work.
 */
export function parseAssistantMarkdownBlocks(content: string): AssistantMarkdownBlock[] {
  const blocks: AssistantMarkdownBlock[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let i = 0;

  const flushCode = () => {
    if (codeBuffer.length > 0) {
      blocks.push({ type: 'code', text: codeBuffer.join('\n') });
      codeBuffer = [];
    }
  };

  while (i < lines.length) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        flushCode();
      } else {
        flushCode();
        inCodeBlock = true;
      }
      i += 1;
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      i += 1;
      continue;
    }

    if (!trimmed) {
      i += 1;
      continue;
    }

    const table = tryParseTableAt(lines, i);
    if (table) {
      blocks.push(table.block);
      i = table.nextIndex;
      continue;
    }

    // Treat Markdown thematic breaks as separators, not literal text.
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s*(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length >= 3 ? 3 : 2;
      blocks.push({
        type: 'heading',
        level,
        text: stripHeadingMarkers(trimmed),
      });
      i += 1;
      continue;
    }
    if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'blockquote', text: trimmed.slice(2).trim() });
      i += 1;
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-*+]\s+/, '') });
      i += 1;
      continue;
    }
    const ordered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (ordered) {
      blocks.push({ type: 'ordered', index: Number(ordered[1]), text: ordered[2] });
      i += 1;
      continue;
    }
    blocks.push({ type: 'paragraph', text: trimmed });
    i += 1;
  }

  if (inCodeBlock) {
    flushCode();
  }

  return blocks;
}
