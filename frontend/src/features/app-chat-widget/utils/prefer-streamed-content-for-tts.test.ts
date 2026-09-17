import { preferStreamedContentForTts } from '@/shared/utils/prefer-streamed-content-for-tts';

describe('preferStreamedContentForTts (chat re-export path)', () => {
  it('still resolves via shared helper', () => {
    expect(preferStreamedContentForTts('Hello', 'Hello world')).toBe('Hello world');
  });
});
