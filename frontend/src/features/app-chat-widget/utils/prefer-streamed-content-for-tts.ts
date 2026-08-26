/**
 * Choose assistant body text after stream finalize so TTS/highlight stays continuous.
 * - Final equals or extends streamed → use final (safe unread suffix).
 * - Final only shares a short prefix but diverges → keep streamed (avoid highlight reset).
 */
export function preferStreamedContentForTts(streamedPlain: string, finalAnswer: string): string {
  const streamed = streamedPlain.trim();
  const final = finalAnswer.trim();
  if (!streamed) return final;
  if (!final) return streamed;
  if (final === streamed || final.startsWith(streamed)) return final;
  return streamed;
}
