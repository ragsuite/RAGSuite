/**
 * Streaming markdown prep — parity with reference:
 * - strip trailing incomplete list markers
 * - strip unverified links until stream completes
 * - close incomplete **bold** so inline emphasis renders mid-stream
 */
import { stripLinksForStreamingPreview } from '@/shared/utils/stream-answer-links';

const LONE_LIST_MARKER_LINE =
  /^\s{0,3}(?:[-*+](?:\s|$)|\d+\.(?:\s|$))\s*$/;

function stripTrailingLoneListLines(markdown: string): string {
  let result = markdown.replace(/\r\n/g, '\n');
  const lines = result.split('\n');

  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last !== undefined && LONE_LIST_MARKER_LINE.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join('\n');
}

/** Close an odd trailing `**` so `**partial` renders as bold while tokens still arrive. */
function closeIncompleteBoldMarkers(markdown: string): string {
  const markers = markdown.match(/\*\*/g);
  if (markers && markers.length % 2 === 1) {
    return `${markdown}**`;
  }
  return markdown;
}

export function prepareStreamingMarkdown(markdown: string): string {
  if (!markdown) return markdown;
  return closeIncompleteBoldMarkers(
    stripLinksForStreamingPreview(stripTrailingLoneListLines(markdown)),
  );
}
