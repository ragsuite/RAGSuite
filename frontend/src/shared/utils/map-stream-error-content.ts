/** Sanitize streamed assistant text when the backend/LLM sent a raw provider error. */
export function mapStreamErrorContent(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'Something went wrong. Please try again.';
  }

  const withoutPrefix = trimmed.replace(/^error:\s*/i, '').trim();
  const lower = withoutPrefix.toLowerCase();

  if (lower.includes('api key')) {
    return 'Invalid or missing API key. Check your chatbot model configuration.';
  }

  // Backend already returned a clear rate-limit / infra message (e.g. Search Test copy).
  // Do not rewrite into a misleading "sending too fast" blame message.
  if (
    lower.includes('hit a rate limit') ||
    lower.includes('handling too many requests') ||
    lower.includes('took too long to respond') ||
    lower.includes('temporarily unavailable') ||
    (lower.includes('configured') &&
      (lower.includes('rate limit') || lower.includes('model')))
  ) {
    return withoutPrefix;
  }

  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limited') ||
    lower.includes('too many concurrent') ||
    lower.includes('too many requests')
  ) {
    if (lower.includes('concurrent')) {
      return (
        'The AI service is handling too many requests at once. ' +
        'Please wait a moment and try again.'
      );
    }
    return 'The AI service hit a rate limit. Please wait a moment and try again.';
  }

  if (lower.includes('503') || lower.includes('overloaded') || lower.includes('service unavailable')) {
    return 'The AI service is temporarily unavailable. Please try again in a few minutes.';
  }

  if (lower.startsWith('error:') || lower.includes('status code:')) {
    return "Sorry, I couldn't generate a response. Please try again.";
  }

  return withoutPrefix;
}
