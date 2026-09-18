/**
 * Light spacing fix for assistant markdown that LLMs sometimes emit as one
 * packed paragraph (jammed lists / code fences without line breaks).
 * Does not rewrite wording.
 */
export function normalizeAssistantMarkdownSpacing(text: string): string {
  if (!text || !text.trim()) return text;

  let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Mid-line ATX headers "### A #### B" → each heading on its own block
  // (before list unjam so "#### 1. Title" stays a heading, not an ordered list).
  t = t.replace(/(?<!\n)(#{1,6}[ \t]+)/g, '\n\n$1');

  // "Section: - item" / "**Steps:** - item" → section then list on new lines
  t = t.replace(/:(\*\*)?[ \t]*-[ \t]+/g, ':$1\n\n- ');
  // Jammed inline bullets " - next" → newline + bullet (not already at BOL)
  t = t.replace(/(?<!\n)[ \t]+-[ \t]+/g, '\n- ');
  // Jammed ordered markers " 1. next" / " 2. next" (not ATX "#### 1. Title")
  t = t.replace(/(?<![#\n])[ \t]+(\d+)\.[ \t]+/g, '\n$1. ');

  // Any fence glued to prior text (open or close) → start on its own line
  t = t.replace(/([^\n])```/g, '$1\n\n```');
  // ```lang jammed content on same line → language on fence line, body next
  t = t.replace(/```([a-zA-Z0-9_-]+)[ \t]+/g, '```$1\n');

  // Blank line before AT headers when already on their own line after prior text
  t = t.replace(/([^\n])\n(#{1,6}[ \t]+)/g, '$1\n\n$2');
  // Blank line after a paragraph before a section label that opens a list
  t = t.replace(/([^\n])\n([^\n]{1,80}:\n\n- )/g, '$1\n\n$2');

  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}
