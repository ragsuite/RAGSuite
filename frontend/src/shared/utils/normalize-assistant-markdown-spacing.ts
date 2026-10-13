/**
 * Light spacing fix for assistant markdown that LLMs sometimes emit as one
 * packed paragraph (jammed lists / code fences without line breaks).
 * Does not rewrite wording.
 */

// A fenced block, or an unclosed fence running to the end (mid-stream text).
const FENCED_RE = /```[\s\S]*?(?:```|$)/g;
// "### A" split as "#" + blank line + "## A" by older normalizer versions; rejoined.
const SPLIT_HEADING_RE = /^(#{1,6})[ \t]*\n(?:[ \t]*\n)*(#{1,6})([ \t]+)/gm;
// A heading marker after text on the same line ("EE #### 1. Title"); the whole marker
// moves, and "C# is" (no space before "#") is left alone.
const MID_LINE_HEADING_RE = /(?<=\S)[ \t]+(#{1,6}[ \t]+)/g;

/** Apply `fn` to the prose between code fences; code stays byte-identical. */
function outsideFences(text: string, fn: (prose: string) => string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(FENCED_RE)) {
    const start = match.index ?? 0;
    out += fn(text.slice(last, start)) + match[0];
    last = start + match[0].length;
  }
  return out + fn(text.slice(last));
}

function spaceHeadings(prose: string): string {
  const rejoined = prose.replace(
    SPLIT_HEADING_RE,
    (_m, first: string, second: string, gap: string) =>
      '#'.repeat(Math.min(6, first.length + second.length)) + gap,
  );
  // Mid-line ATX headers "### A #### B" → each heading on its own block
  // (before list unjam so "#### 1. Title" stays a heading, not an ordered list).
  return rejoined.replace(MID_LINE_HEADING_RE, '\n\n$1');
}

/** " - " inside a bold name ("**Lip Balm - Set of 2**") is part of the name. */
function bulletOutsideBold(match: string, offset: number, text: string): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const boldMarkers = text.slice(lineStart, offset).split('**').length - 1;
  return boldMarkers % 2 ? match : '\n- ';
}

function blankLineBeforeHeadings(prose: string): string {
  return prose.replace(/([^\n])\n(#{1,6}[ \t]+)/g, '$1\n\n$2');
}

export function normalizeAssistantMarkdownSpacing(text: string): string {
  if (!text || !text.trim()) return text;

  let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  t = outsideFences(t, spaceHeadings);

  // "Section: - item" / "**Steps:** - item" → section then list on new lines
  t = t.replace(/:(\*\*)?[ \t]*-[ \t]+/g, ':$1\n\n- ');
  // Jammed inline bullets " - next" → newline + bullet (not already at BOL)
  t = t.replace(/(?<!\n)[ \t]+-[ \t]+/g, bulletOutsideBold);
  // Jammed ordered markers " 1. next" / " 2. next" (not ATX "#### 1. Title")
  t = t.replace(/(?<![#\n])[ \t]+(\d+)\.[ \t]+/g, '\n$1. ');

  // Any fence glued to prior text (open or close) → start on its own line
  t = t.replace(/([^\n])```/g, '$1\n\n```');
  // ```lang jammed content on same line → language on fence line, body next
  t = t.replace(/```([a-zA-Z0-9_-]+)[ \t]+/g, '```$1\n');

  // Blank line before AT headers when already on their own line after prior text
  t = outsideFences(t, blankLineBeforeHeadings);
  // Blank line after a paragraph before a section label that opens a list
  t = t.replace(/([^\n])\n([^\n]{1,80}:\n\n- )/g, '$1\n\n$2');

  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}
