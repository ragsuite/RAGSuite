import { isAbbreviationPeriod } from './web-speech';

/**
 * Find the next speakable prefix of unspoken streaming text.
 * Prefers sentence/line boundaries; falls back to a word boundary once
 * enough characters have buffered so speech can start before the first period.
 * Skips abbreviation periods (e.g. z.B., usw.) so soft cuts stay aligned.
 * Leading whitespace is skipped so `\n\n` after a `?` paragraph does not stall
 * the next bullet/line chunk (`search(/\n/) === 0` used to fail minLine).
 */
export function findNextSpeakableChunk(
  unspoken: string,
  options?: { minSentenceChars?: number; minLineChars?: number; softMinChars?: number },
): { chunk: string; consumeLen: number } | null {
  if (!unspoken) return null;
  const lead = unspoken.match(/^\s*/)?.[0].length ?? 0;
  const body = unspoken.slice(lead);
  if (!body) return null;

  const minSentence = options?.minSentenceChars ?? 12;
  const minLine = options?.minLineChars ?? 12;
  const softMin = options?.softMinChars ?? 80;

  const sentenceEnd = findSentenceEndIndex(body, minSentence);
  if (sentenceEnd >= minSentence) {
    const bodyConsume = sentenceEnd + 1;
    const chunk = body.slice(0, bodyConsume).trim();
    return chunk ? { chunk, consumeLen: lead + bodyConsume } : null;
  }

  const lineEnd = body.search(/\n/);
  if (lineEnd >= minLine) {
    const bodyConsume = lineEnd + 1;
    const chunk = body.slice(0, bodyConsume).trim();
    return chunk ? { chunk, consumeLen: lead + bodyConsume } : null;
  }

  if (body.length >= softMin) {
    const slice = body.slice(0, softMin);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace >= Math.floor(softMin * 0.5)) {
      const bodyConsume = lastSpace + 1;
      const chunk = body.slice(0, bodyConsume).trim();
      return chunk ? { chunk, consumeLen: lead + bodyConsume } : null;
    }
  }

  return null;
}

/** Index of a real sentence terminator, skipping abbreviation periods. */
function findSentenceEndIndex(unspoken: string, minSentence: number): number {
  const re = /[.!?।](?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(unspoken)) !== null) {
    if (match.index < minSentence) continue;
    const ch = match[0];
    if (ch === '.') {
      const prefix = unspoken.slice(0, match.index + 1);
      if (isAbbreviationPeriod(prefix)) continue;
    }
    return match.index;
  }
  return -1;
}
