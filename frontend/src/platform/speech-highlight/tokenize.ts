export type SpeechWordToken = {
  index: number;
  text: string;
  start: number;
  end: number;
};

/** Split plain speakable text into sequential word tokens (whitespace preserved separately). */
export function tokenizeSpeechWords(plain: string): SpeechWordToken[] {
  const tokens: SpeechWordToken[] = [];
  if (!plain) return tokens;

  const re = /\S+/g;
  let match: RegExpExecArray | null = re.exec(plain);
  let index = 0;
  while (match) {
    tokens.push({
      index,
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
    index += 1;
    match = re.exec(plain);
  }
  return tokens;
}

export function countSpeechWords(plain: string): number {
  return tokenizeSpeechWords(plain).length;
}
