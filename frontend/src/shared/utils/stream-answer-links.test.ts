import {
  resolveStreamFinalAnswer,
  stripLinksForStreamingPreview,
} from '@/shared/utils/stream-answer-links';
import { prepareStreamingMarkdown } from '@/shared/utils/prepare-streaming-markdown';

describe('stripLinksForStreamingPreview', () => {
  it('strips markdown and bare urls during stream', () => {
    const input = 'Quality info here.\n\nMore at [docs](https://example.com) and https://x.test/path';
    expect(stripLinksForStreamingPreview(input)).toBe('Quality info here.\n\nMore at docs and');
  });

  it('leaves plain text unchanged', () => {
    const input = 'No links here.';
    expect(stripLinksForStreamingPreview(input)).toBe(input);
  });
});

describe('resolveStreamFinalAnswer', () => {
  it('prefers final_answer when present', () => {
    expect(resolveStreamFinalAnswer({ final_answer: ' Final ' }, 'streamed')).toBe('Final');
  });

  it('falls back to streamed text', () => {
    expect(resolveStreamFinalAnswer({}, 'streamed')).toBe('streamed');
  });
});

describe('prepareStreamingMarkdown', () => {
  it('strips incomplete list markers and links', () => {
    const input = 'Hello [a](https://a.test)\n- ';
    expect(prepareStreamingMarkdown(input)).toBe('Hello a');
  });
});
