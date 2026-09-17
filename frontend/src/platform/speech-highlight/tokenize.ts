export type SpeechWordToken = {
  index: number;
  text: string;
  start: number;
  end: number;
};

/**
 * Standalone list markers that speak-plain strips (normalizeSpeechWhitespace ^•)
 * must not consume a highlight word index in the DOM/markdown paint path.
 */
const SPEECH_SKIP_TOKEN_RE = /^[•·∙●◦]+$/u;

/** True when a non-whitespace token should receive a speech-highlight index. */
export function isSpeechHighlightWordToken(part: string): boolean {
  if (!part || /^\s+$/.test(part)) return false;
  if (SPEECH_SKIP_TOKEN_RE.test(part)) return false;
  return true;
}

/** Split plain speakable text into sequential word tokens (whitespace preserved separately). */
export function tokenizeSpeechWords(plain: string): SpeechWordToken[] {
  const tokens: SpeechWordToken[] = [];
  if (!plain) return tokens;

  const re = /\S+/g;
  let match: RegExpExecArray | null = re.exec(plain);
  let index = 0;
  while (match) {
    const text = match[0];
    if (isSpeechHighlightWordToken(text)) {
      tokens.push({
        index,
        text,
        start: match.index,
        end: match.index + text.length,
      });
      index += 1;
    }
    match = re.exec(plain);
  }
  return tokens;
}

export function countSpeechWords(plain: string): number {
  return tokenizeSpeechWords(plain).length;
}
