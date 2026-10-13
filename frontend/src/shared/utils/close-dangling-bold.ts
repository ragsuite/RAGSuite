/**
 * Close a `**` left open at the end of a line ("- **Highline:** **11.10.07.44").
 * Bold never spans lines in paragraphs or list items, so the opener would otherwise
 * render as literal asterisks. Code fences and table rows are left untouched.
 */

const FENCE_RE = /^\s{0,3}```/;
const TABLE_ROW_RE = /^\s*\|/;
const BOLD_RE = /\*\*/g;

function closeLine(line: string): string {
  if (TABLE_ROW_RE.test(line)) return line;
  const markers = line.match(BOLD_RE);
  if (!markers || markers.length % 2 === 0) return line;
  const body = line.trimEnd();
  const after = body.slice(body.lastIndexOf('**') + 2);
  if (!after || /^\s/.test(after)) return line;
  return `${body}**${line.slice(body.length)}`;
}

export function closeDanglingBold(markdown: string): string {
  if (!markdown || !markdown.includes('**')) return markdown;
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : closeLine(line);
    })
    .join('\n');
}
