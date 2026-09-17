import { preferStreamedContentForTts } from '@/shared/utils/prefer-streamed-content-for-tts';

describe('preferStreamedContentForTts', () => {
  it('uses final when it equals streamed', () => {
    expect(preferStreamedContentForTts('Hello world', 'Hello world')).toBe('Hello world');
  });

  it('uses final when it extends streamed (safe unread suffix)', () => {
    expect(preferStreamedContentForTts('Hello world', 'Hello world ready.')).toBe(
      'Hello world ready.',
    );
  });

  it('uses final when it appends a closing paragraph after streamed bullets', () => {
    const streamed =
      '## Key Offerings\n\n- Templates\n- Support\n\n';
    const final =
      `${streamed}T3Planet positions itself as both a practical resource hub and a collaborative space.`;
    expect(preferStreamedContentForTts(streamed, final)).toBe(final.trim());
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
