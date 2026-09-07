import { mapStreamErrorContent } from '@/shared/utils/map-stream-error-content';

describe('mapStreamErrorContent', () => {
  it('preserves backend provider/model rate-limit copy for chat', () => {
    const backend =
      'The configured Mistral model (`mistral-small-latest`) hit a rate limit. Please wait a moment and try again.';
    expect(mapStreamErrorContent(backend)).toBe(backend);
  });

  it('does not blame the user for raw 429 errors', () => {
    const out = mapStreamErrorContent(
      'API error occurred: Status 429. Body: {"message":"Rate limit exceeded","type":"rate_limited"}',
    );
    expect(out.toLowerCase()).toContain('rate limit');
    expect(out.toLowerCase()).not.toContain('sending messages too fast');
  });

  it('maps concurrent limits without user blame', () => {
    const out = mapStreamErrorContent('Error: too many concurrent requests (status code: 429)');
    expect(out.toLowerCase()).toContain('too many requests');
    expect(out.toLowerCase()).not.toContain('sending messages too fast');
  });

  it('passes through normal answers', () => {
    expect(mapStreamErrorContent('NITSAN is a TYPO3 agency.')).toBe(
      'NITSAN is a TYPO3 agency.',
    );
  });
});
