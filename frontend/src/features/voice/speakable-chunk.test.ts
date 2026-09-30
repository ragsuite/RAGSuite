import { findNextSpeakableChunk } from './speakable-chunk';

describe('findNextSpeakableChunk', () => {
  it('returns a sentence chunk when a terminator is present', () => {
    const text = 'NITSAN is an AI company. It builds RAG products. More';
    const next = findNextSpeakableChunk(text);
    expect(next).toEqual({
      chunk: 'NITSAN is an AI company.',
      consumeLen: 'NITSAN is an AI company.'.length,
    });
  });

  it('speaks at a word boundary once soft min chars buffer without punctuation', () => {
    const words =
      'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi ';
    expect(words.length).toBeGreaterThanOrEqual(80);
    const next = findNextSpeakableChunk(words);
    expect(next).not.toBeNull();
    expect(next!.chunk.length).toBeGreaterThan(40);
    expect(next!.chunk.includes(' ')).toBe(true);
  });

  it('waits when buffer is short and has no sentence end', () => {
    expect(findNextSpeakableChunk('Hello there')).toBeNull();
  });

  it('uses a line break as a boundary', () => {
    const next = findNextSpeakableChunk('First line here\nSecond line');
    expect(next).toEqual({
      chunk: 'First line here',
      consumeLen: 'First line here\n'.length,
    });
  });

  it('does not soft-split on German z.B. abbreviation periods', () => {
    const text =
      'Hier ist z.B. ein längerer deutscher Satz mit genug Text damit wir nicht am Soft-Min warten.';
    const next = findNextSpeakableChunk(text, { minSentenceChars: 12, softMinChars: 200 });
    expect(next).not.toBeNull();
    expect(next!.chunk.toLowerCase()).toContain('z.b.');
    expect(next!.chunk).toMatch(/\.$/);
    // Consumed past the abbreviation; first real sentence end wins.
    expect(next!.consumeLen).toBeGreaterThan(text.indexOf('z.B.') + 4);
  });

  it('does not soft-split on German usw. abbreviation periods', () => {
    const text =
      'Wir nutzen Tools usw. und weitere Systeme in der Pipeline für stabile Ergebnisse heute.';
    const next = findNextSpeakableChunk(text, { minSentenceChars: 12, softMinChars: 200 });
    expect(next).not.toBeNull();
    expect(next!.chunk.toLowerCase()).toContain('usw.');
    expect(next!.consumeLen).toBeGreaterThan(text.indexOf('usw.') + 4);
  });

  it('skips leading newlines after a ? paragraph so the next bullet is speakable', () => {
    const first = 'What is NITSAN?';
    const unspoken = '\n\n- First bullet without period\n- Second item here';
    const next = findNextSpeakableChunk(unspoken);
    expect(next).not.toBeNull();
    expect(next!.chunk).toBe('- First bullet without period');
    expect(next!.consumeLen).toBe('\n\n- First bullet without period\n'.length);
    // Prefix alignment: spokenLen + consumeLen still matches full plain text.
    const full = `${first}${unspoken}`;
    expect(full.slice(0, first.length + next!.consumeLen)).toBe(
      `${first}\n\n- First bullet without period\n`,
    );
  });

  it('returns null for whitespace-only unspoken', () => {
    expect(findNextSpeakableChunk('\n\n  \n')).toBeNull();
  });
});
