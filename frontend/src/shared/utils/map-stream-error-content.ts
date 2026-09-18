/** Sanitize streamed assistant text when the backend/LLM sent a raw provider error. */

const PROVIDER_ERROR_MAX_CHARS = 400;

/**
 * True only for short, error-shaped payloads — not long grounded answers that
 * happen to mention "API key", "rate limit", etc. in product documentation.
 */
export function looksLikeProviderError(text: string): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed || trimmed.length > PROVIDER_ERROR_MAX_CHARS) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (/^error:\s*/i.test(trimmed)) return true;
  if (lower.includes('status code:')) return true;
  if (lower.includes('api error occurred')) return true;

  if (
    /\b(invalid|incorrect|missing)\s+api\s+key\b/.test(lower) ||
    /\binvalid_api_key\b/.test(lower) ||
    /\bauthentication_error\b/.test(lower) ||
    /\bunauthorized\b/.test(lower)
  ) {
    return true;
  }

  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limited') ||
    lower.includes('too many concurrent') ||
    lower.includes('too many requests') ||
    lower.includes('503') ||
    lower.includes('overloaded') ||
    lower.includes('service unavailable') ||
    lower.includes('took too long to respond') ||
    lower.includes('temporarily unavailable') ||
    (lower.includes('hit a rate limit') && lower.includes('configured'))
  ) {
    return true;
  }

  return false;
}

/** Sanitize streamed assistant text when the backend/LLM sent a raw provider error. */
export function mapStreamErrorContent(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'Something went wrong. Please try again.';
  }

  if (!looksLikeProviderError(trimmed)) {
    return trimmed;
  }

  const withoutPrefix = trimmed.replace(/^error:\s*/i, '').trim();
  const lower = withoutPrefix.toLowerCase();

  if (
    /\b(invalid|incorrect|missing)\s+api\s+key\b/.test(lower) ||
    /\binvalid_api_key\b/.test(lower) ||
    (lower.includes('api key') &&
      (lower.includes('unauthorized') ||
        lower.includes('authentication') ||
        lower.includes('invalid') ||
        lower.includes('incorrect') ||
        lower.includes('missing') ||
        /^error:\s*/i.test(trimmed)))
  ) {
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

  if (/^error:\s*/i.test(trimmed) || lower.includes('status code:')) {
    return "Sorry, I couldn't generate a response. Please try again.";
  }

  return withoutPrefix;
}
