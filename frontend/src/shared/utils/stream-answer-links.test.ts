import {
  resolveStreamFinalAnswer,
  stripLinksForStreamingPreview,
} from '@/shared/utils/stream-answer-links';
import { prepareStreamingMarkdown } from '@/shared/utils/prepare-streaming-markdown';
import { inflateMarkdownBoldToHtml } from '@/shared/utils/html-content';

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

  it('closes incomplete bold markers during stream', () => {
    expect(prepareStreamingMarkdown('RAGSuite is **enterprise')).toBe(
      'RAGSuite is **enterprise**',
    );
  });

  it('leaves closed bold markers unchanged', () => {
    expect(prepareStreamingMarkdown('**enterprise software**')).toBe(
      '**enterprise software**',
    );
  });
});

describe('inflateMarkdownBoldToHtml', () => {
  it('converts markdown bold inside HTML', () => {
    expect(
      inflateMarkdownBoldToHtml(
        '<p>RAGSuite is **enterprise software innovation by NITSAN**.</p>',
      ),
    ).toBe(
      '<p>RAGSuite is <strong>enterprise software innovation by NITSAN</strong>.</p>',
    );
  });
});
