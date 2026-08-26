import { preferStreamedContentForTts } from './prefer-streamed-content-for-tts';

describe('preferStreamedContentForTts', () => {
  it('uses final when it equals streamed', () => {
    expect(preferStreamedContentForTts('Hello world', 'Hello world')).toBe('Hello world');
  });

  it('uses final when it extends streamed (safe unread suffix)', () => {
    expect(preferStreamedContentForTts('Hello world', 'Hello world ready.')).toBe(
      'Hello world ready.',
    );
  });

  it('keeps streamed when final only shares a short prefix but diverges', () => {
    expect(
      preferStreamedContentForTts(
        'Hello world this is the streamed answer.',
        'Hello world this is a polished rewrite with links.',
      ),
    ).toBe('Hello world this is the streamed answer.');
  });

  it('falls back sensibly when one side is empty', () => {
    expect(preferStreamedContentForTts('', 'Final only')).toBe('Final only');
    expect(preferStreamedContentForTts('Streamed only', '')).toBe('Streamed only');
  });
});
