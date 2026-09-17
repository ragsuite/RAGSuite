import {
  looksLikeProviderError,
  mapStreamErrorContent,
} from '@/shared/utils/map-stream-error-content';

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

  it('does not rewrite long CE/EE answers that mention API key in prose', () => {
    const longAnswer = [
      '## Community Edition vs Enterprise Edition',
      '',
      'RAGSuite CE is open source under Apache 2.0. EE adds SSO, RBAC, and advanced analytics.',
      '',
      '### Licensing & Access',
      '- CE: free to use; no vendor license required.',
      '- EE: requires a vendor-issued offline key for activation.',
      '',
      '### Configuration',
      'In Model Settings you can store an API key for hosted providers such as Mistral or OpenAI.',
      'CE and EE both support the same chatbot configuration surfaces for domains and customization.',
      '',
      '### Activation',
      'CE needs no activation steps. EE uses `ragsuite activate` with the offline key.',
      '',
      'Always verify the current edition in your deployment before enabling EE-only modules.',
    ].join('\n');

    expect(longAnswer.toLowerCase()).toContain('api key');
    expect(longAnswer.length).toBeGreaterThan(400);
    expect(looksLikeProviderError(longAnswer)).toBe(false);
    expect(mapStreamErrorContent(longAnswer)).toBe(longAnswer);
  });

  it('still maps short invalid API key provider errors', () => {
    expect(mapStreamErrorContent('Error: Invalid API key')).toBe(
      'Invalid or missing API key. Check your chatbot model configuration.',
    );
    expect(mapStreamErrorContent('Incorrect API key provided.')).toBe(
      'Invalid or missing API key. Check your chatbot model configuration.',
    );
  });
});
