/**
 * Hide links while SSE tokens stream; show verified links only after `done`.
 * Parity with reference `streamAnswerLinks`.
 */
export function stripLinksForStreamingPreview(text: string): string {
  if (!text) return text;

  let out = text;

  // Dedicated "Link:" bullet lines (injected or model-generated).
  out = out.replace(/^\s*[-*]\s*\*{0,2}\s*link\s*:\*{0,2}.*$/gim, '');

  // Markdown links -> label only (no clickable URL during stream).
  out = out.replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]+\)/gi, '$1');

  // Bare URLs.
  out = out.replace(/(?:https?:\/\/|www\.)\S+/gi, '');

  out = out.replace(/\n{3,}/g, '\n\n').trimEnd();
  return out;
}

type StreamDonePayload = {
  final_answer?: unknown;
  answer_updated?: unknown;
};

/** Prefer server-finalized answer (verified links) over raw streamed tokens. */
export function resolveStreamFinalAnswer(parsed: StreamDonePayload, streamed: string): string {
  const final = typeof parsed.final_answer === 'string' ? parsed.final_answer.trim() : '';
  if (final) return final;
  return streamed;
}
