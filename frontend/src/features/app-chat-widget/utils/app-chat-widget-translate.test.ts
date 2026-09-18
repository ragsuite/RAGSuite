import {
  TRANSLATE_BATCH_SIZE,
  chunkTranslateMessages,
  mergeTranslationMaps,
  sanitizeTranslatedOverlay,
  sanitizeTranslationBatch,
  translationsCoverBatchIds,
} from './app-chat-widget-translate';

function stripMarkdownStub(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

describe('app-chat-widget-translate', () => {
  it('chunks messages into fixed-size batches preserving order', () => {
    const messages = Array.from({ length: 17 }, (_, i) => ({ id: `m${i}` }));
    const batches = chunkTranslateMessages(messages, 8);
    expect(TRANSLATE_BATCH_SIZE).toBe(8);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(8);
    expect(batches[1]).toHaveLength(8);
    expect(batches[2]).toHaveLength(1);
    expect(batches[0][0].id).toBe('m0');
    expect(batches[2][0].id).toBe('m16');
  });

  it('returns empty array for empty input', () => {
    expect(chunkTranslateMessages([])).toEqual([]);
  });

  it('requires every expected id to have a non-empty translation', () => {
    expect(translationsCoverBatchIds({ a: 'Hallo', b: 'Welt' }, ['a', 'b'])).toBe(true);
    expect(translationsCoverBatchIds({ a: 'Hallo' }, ['a', 'b'])).toBe(false);
    expect(translationsCoverBatchIds({ a: 'Hallo', b: '  ' }, ['a', 'b'])).toBe(false);
    expect(translationsCoverBatchIds(null, ['a'])).toBe(false);
    expect(translationsCoverBatchIds({}, [])).toBe(false);
  });

  it('merges batch maps without applying partial failure semantics', () => {
    const merged = mergeTranslationMaps([
      { a: 'Eins', b: 'Zwei' },
      { c: 'Drei' },
    ]);
    expect(merged).toEqual({ a: 'Eins', b: 'Zwei', c: 'Drei' });
  });

  it('atomic apply: only merge when every batch covers its ids', () => {
    const batches = [
      [
        { id: '1', content: 'Hi' },
        { id: '2', content: 'There' },
      ],
      [{ id: '3', content: 'Again' }],
    ];
    const batchResults: Record<string, string>[] = [
      { '1': 'Hallo', '2': 'Dort' },
      { '3': 'Wieder' },
    ];
    const allOk = batches.every((batch, i) =>
      translationsCoverBatchIds(
        batchResults[i],
        batch.map((m) => m.id),
      ),
    );
    expect(allOk).toBe(true);
    expect(mergeTranslationMaps(batchResults)).toEqual({
      '1': 'Hallo',
      '2': 'Dort',
      '3': 'Wieder',
    });

    const failedSecond: Record<string, string>[] = [
      { '1': 'Hallo', '2': 'Dort' },
      { '3': '' },
    ];
    const shouldAbort = batches.every((batch, i) =>
      translationsCoverBatchIds(
        failedSecond[i],
        batch.map((m) => m.id),
      ),
    );
    expect(shouldAbort).toBe(false);
  });

  it('sanitizeTranslatedOverlay strips Markdown for user only', () => {
    expect(
      sanitizeTranslatedOverlay('user', 'नंबर **+91 9727020020** का मालिक?', stripMarkdownStub),
    ).toBe('नंबर +91 9727020020 का मालिक?');
    expect(sanitizeTranslatedOverlay('user', '## **Hello**', stripMarkdownStub)).toBe('Hello');
    expect(
      sanitizeTranslatedOverlay('assistant', 'See **docs** and ## heading', stripMarkdownStub),
    ).toBe('See **docs** and ## heading');
  });

  it('sanitizeTranslationBatch applies role-aware cleanup', () => {
    const batch = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant' },
    ];
    const sanitized = sanitizeTranslationBatch(
      {
        u1: 'Who owns **+91 9727020020**?',
        a1: 'Contact **support** please.',
      },
      batch,
      stripMarkdownStub,
    );
    expect(sanitized).toEqual({
      u1: 'Who owns +91 9727020020?',
      a1: 'Contact **support** please.',
    });
  });
});
