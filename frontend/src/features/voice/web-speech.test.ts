import {
  baseWordsPerMinuteForLanguage,
  buildSpeechSegments,
  buildSpokenToVisibleWordMap,
  estimateUtteranceDurationMs,
  expandAbbreviationsForSpeech,
  fallbackLocalWordIndex,
  clampFallbackWordAdvance,
  HIGHLIGHT_FALLBACK_LAG_MS,
  getSpeechPlainText,
  prepareTextForSpeech,
  selectProfessionalVoice,
  splitIntoSentences,
  splitSpeechChunks,
  stripSpeechMarkup,
  resolveSttLocale,
  toSpeechLocale,
} from './web-speech';

describe('toSpeechLocale', () => {
  it('maps widget language codes to BCP-47', () => {
    expect(toSpeechLocale('en')).toBe('en-US');
    expect(toSpeechLocale('en-us')).toBe('en-US');
    expect(toSpeechLocale('en_in')).toBe('en-IN');
    expect(toSpeechLocale('en-gb')).toBe('en-GB');
    expect(toSpeechLocale('hi')).toBe('en-US');
    expect(toSpeechLocale('es')).toBe('es-ES');
    expect(toSpeechLocale('fr')).toBe('fr-FR');
    expect(toSpeechLocale('de')).toBe('de-DE');
    expect(toSpeechLocale('ar')).toBe('ar-SA');
    expect(toSpeechLocale('pt')).toBe('pt-PT');
    expect(toSpeechLocale('pt-br')).toBe('pt-BR');
    expect(toSpeechLocale('zh')).toBe('zh-CN');
    expect(toSpeechLocale('zh-cn')).toBe('zh-CN');
    expect(toSpeechLocale('zh-tw')).toBe('zh-TW');
    expect(toSpeechLocale('it')).toBe('it-IT');
    expect(toSpeechLocale(null)).toBe('en-US');
  });
});

describe('resolveSttLocale', () => {
  const originalLanguage = Object.getOwnPropertyDescriptor(navigator, 'language');

  afterEach(() => {
    if (originalLanguage) {
      Object.defineProperty(navigator, 'language', originalLanguage);
    }
  });

  it('returns navigator.language when set', () => {
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => 'de-DE',
    });
    expect(resolveSttLocale()).toBe('de-DE');
  });

  it('falls back to en-US when navigator.language is empty', () => {
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => '   ',
    });
    expect(resolveSttLocale()).toBe('en-US');
  });
});

describe('stripSpeechMarkup', () => {
  it('removes markdown markers', () => {
    expect(stripSpeechMarkup('**Hello** [link](https://x.test)')).toBe('Hello link');
  });
});

describe('getSpeechPlainText', () => {
  it('extracts readable text from markdown answers', () => {
    expect(getSpeechPlainText('**Hello** world.')).toBe('Hello world.');
  });

  it('keeps heading and list breaks for spoken pauses', () => {
    const spoken = getSpeechPlainText(
      '## NITSAN क्या है?\n\nNITSAN एक TYPO3 एजेंसी है।\n\n- TYPO3 GmbH का आधिकारिक पार्टनर',
    );
    expect(spoken).toContain('NITSAN क्या है?');
    expect(spoken).toContain('\n');
    expect(spoken.indexOf('NITSAN क्या है?')).toBeLessThan(spoken.indexOf('TYPO3 एजेंसी'));
  });

  it('does not throw on nullish or non-string input', () => {
    expect(getSpeechPlainText(null)).toBe('');
    expect(getSpeechPlainText(undefined)).toBe('');
    expect(getSpeechPlainText(42 as unknown as string)).toBe('42');
  });
});

describe('prepareTextForSpeech', () => {
  it('strips urls and markdown noise', () => {
    expect(prepareTextForSpeech('See https://example.com for **details**.')).toBe(
      'See for details.',
    );
  });
});

describe('expandAbbreviationsForSpeech', () => {
  it('expands e.g. and i.e. for natural reading', () => {
    expect(expandAbbreviationsForSpeech('Tools e.g. Python and i.e. JavaScript.')).toBe(
      'Tools for example Python and that is JavaScript.',
    );
  });

  it('preserves decimal numbers', () => {
    expect(expandAbbreviationsForSpeech('Version 3.14 is stable.')).toBe('Version 3.14 is stable.');
  });

  it('expands Pvt. Ltd. so the engine does not pause on abbreviation dots', () => {
    expect(expandAbbreviationsForSpeech('NITSAN Technologies Pvt. Ltd.')).toBe(
      'NITSAN Technologies Private Limited',
    );
  });

  it('expands German abbreviations for natural reading', () => {
    expect(expandAbbreviationsForSpeech('Nutze z.B. React usw. und Nr. 12 ca. 5 Minuten.')).toBe(
      'Nutze zum Beispiel React und so weiter und Nummer 12 circa 5 Minuten.',
    );
  });

  it('does not rewrite Corporate as Corporation', () => {
    expect(expandAbbreviationsForSpeech('Corporate office in Bhavnagar.')).toBe(
      'Corporate office in Bhavnagar.',
    );
  });
});

describe('splitIntoSentences', () => {
  it('does not split on e.g. periods', () => {
    const sentences = splitIntoSentences('Use frameworks e.g. React. Then deploy.');
    expect(sentences).toEqual([
      'Use frameworks for example React.',
      'Then deploy.',
    ]);
  });

  it('does not split Pvt. Ltd. into two sentences', () => {
    expect(splitIntoSentences('NITSAN Technologies Pvt. Ltd. is in Bhavnagar.')).toEqual([
      'NITSAN Technologies Private Limited is in Bhavnagar.',
    ]);
  });
});

describe('buildSpeechSegments', () => {
  it('uses a short handoff after punctuated newlines (engine already paused)', () => {
    const segments = buildSpeechSegments('First block.\n\nSecond block.');
    expect(segments.length).toBe(2);
    expect(segments[0].pauseAfterMs).toBeGreaterThan(0);
    expect(segments[0].pauseAfterMs).toBeLessThanOrEqual(200);
    expect(segments[1].pauseAfterMs).toBe(0);
  });

  it('uses shorter pauses between sentences on the same line', () => {
    const segments = buildSpeechSegments('First sentence. Second sentence.');
    expect(segments.length).toBe(1);
    expect(segments[0].text).toContain('First sentence.');
    expect(segments[0].text).toContain('Second sentence.');
  });

  it('pauses after titles and labels that have no full stop', () => {
    const segments = buildSpeechSegments('उपलब्धियाँ:\nTYPO3 GmbH का आधिकारिक पार्टनर');
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[0].text).toContain('उपलब्धियाँ');
    expect(segments[0].pauseAfterMs).toBeGreaterThanOrEqual(200);
    expect(segments[0].pauseAfterMs).toBeLessThan(400);
    expect(segments[0].text).not.toContain('आधिकारिक');
  });

  it('keeps company suffixes in one spoken phrase', () => {
    const segments = buildSpeechSegments('NITSAN Technologies Pvt. Ltd.');
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('NITSAN Technologies Private Limited');
    expect(segments[0].text).not.toMatch(/Pvt\.|Ltd\./);
  });
});

describe('splitSpeechChunks', () => {
  it('splits long answers into readable chunks', () => {
    const text =
      'First sentence here. Second sentence with more detail. Third sentence wraps up the answer.';
    const chunks = splitSpeechChunks(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('First sentence here.');
  });
});

describe('selectProfessionalVoice', () => {
  it('prefers premium voices over compact defaults', () => {
    const picked = selectProfessionalVoice('en-US', [
      { name: 'Compact Voice', lang: 'en-US', default: true, localService: true },
      { name: 'Google US English', lang: 'en-US', localService: false },
    ]);
    expect(picked?.name).toBe('Google US English');
  });

  it('prefers local natural voices over network voices for boundary reliability', () => {
    const picked = selectProfessionalVoice('en-IN', [
      { name: 'Google US English', lang: 'en-US', localService: false },
      { name: 'Samantha', lang: 'en-IN', localService: true },
    ]);
    expect(picked?.name).toBe('Samantha');
  });

  it('prefers indian accent voices for en-IN', () => {
    const picked = selectProfessionalVoice('en-IN', [
      { name: 'Google US English', lang: 'en-US', localService: false },
      { name: 'Microsoft India Neerja Online (Natural)', lang: 'en-IN', localService: false },
    ]);
    expect(picked?.name).toBe('Microsoft India Neerja Online (Natural)');
  });

  it('prefers local de-DE voices for German (boundary reliability)', () => {
    const picked = selectProfessionalVoice('de-DE', [
      { name: 'Google Deutsch', lang: 'de-DE', localService: false },
      { name: 'Anna', lang: 'de-DE', localService: true },
    ]);
    expect(picked?.name).toBe('Anna');
  });

  it('never crosses to English when selecting German', () => {
    const picked = selectProfessionalVoice('de-DE', [
      { name: 'Google US English', lang: 'en-US', localService: true },
      { name: 'Microsoft Katja', lang: 'de-DE', localService: false },
    ]);
    expect(picked?.name).toBe('Microsoft Katja');
    expect(picked?.lang.toLowerCase().startsWith('de')).toBe(true);
  });

  it('prefers exact en-US local voices for English', () => {
    const picked = selectProfessionalVoice('en-US', [
      { name: 'Google UK English Female', lang: 'en-GB', localService: false },
      { name: 'Samantha', lang: 'en-US', localService: true },
    ]);
    expect(picked?.name).toBe('Samantha');
  });
});

describe('estimateUtteranceDurationMs / fallbackLocalWordIndex', () => {
  it('estimates a positive duration from word count and rate', () => {
    const ms = estimateUtteranceDurationMs('one two three four five', 0.93);
    expect(ms).toBeGreaterThanOrEqual(800);
  });

  it('keeps English WPM baseline unchanged', () => {
    const en = estimateUtteranceDurationMs('one two three four five', 1, 'en-US');
    const defaultLang = estimateUtteranceDurationMs('one two three four five', 1);
    expect(en).toBe(defaultLang);
  });

  it('estimates longer duration for dense CJK than English at same word count', () => {
    const text = 'one two three four five six seven eight';
    const en = estimateUtteranceDurationMs(text, 1, 'en');
    const zh = estimateUtteranceDurationMs(text, 1, 'zh-CN');
    expect(zh).toBeGreaterThan(en);
  });

  it('seeds at word 0 early and reaches the last word near the end', () => {
    // Light lag keeps very early progress on word 0, then tracks the voice.
    expect(fallbackLocalWordIndex(0, 1000, 5)).toBe(0);
    expect(fallbackLocalWordIndex(200, 1000, 5)).toBe(0);
    expect(fallbackLocalWordIndex(HIGHLIGHT_FALLBACK_LAG_MS + 200, 1000, 5)).toBe(1);
    expect(fallbackLocalWordIndex(999, 1000, 5)).toBe(4);
    expect(fallbackLocalWordIndex(5000, 1000, 5)).toBe(4);
  });

  it('clamps fallback advance to one word per step', () => {
    expect(clampFallbackWordAdvance(0, -1)).toBe(0);
    expect(clampFallbackWordAdvance(3, 0)).toBe(1);
    expect(clampFallbackWordAdvance(2, 2)).toBe(2);
    expect(clampFallbackWordAdvance(1, 4)).toBe(4);
  });
});

describe('list bullet alignment', () => {
  it('strips synthetic html bullets from speakable plain text', () => {
    const plain = getSpeechPlainText('<ul><li>Hello world</li></ul>');
    expect(plain).not.toMatch(/•/);
    expect(plain.toLowerCase()).toContain('hello');
  });
});

describe('buildSpokenToVisibleWordMap', () => {
  it('uses identity mapping when no abbreviations expand', () => {
    const map = buildSpokenToVisibleWordMap('Hello world ready.');
    expect(map.visibleWordCount).toBe(3);
    expect(map.spokenWordCount).toBe(3);
    expect(map.spokenToVisible).toEqual([0, 1, 2]);
  });

  it('maps expanded e.g. spoken words within the visible stream', () => {
    const plain = 'Use e.g. this.';
    const map = buildSpokenToVisibleWordMap(plain);
    const prep = prepareTextForSpeech(plain);
    const spoken = expandAbbreviationsForSpeech(prep);
    expect(spoken.toLowerCase()).toContain('for example');
    expect(map.spokenWordCount).toBe((spoken.match(/\S+/g) || []).length);
    expect(map.visibleWordCount).toBe((prep.match(/\S+/g) || []).length);
    expect(map.spokenToVisible.every((v) => v >= 0 && v < map.visibleWordCount)).toBe(true);
    expect(Math.max(...map.spokenToVisible)).toBe(map.visibleWordCount - 1);
  });

  it('collapses multi-word expansions onto the abbreviated visible token', () => {
    const map = buildSpokenToVisibleWordMap('Books etc. sold.');
    // "etc." → "and so on" (3 spoken words) share one visible index
    const freq = new Map<number, number>();
    for (const visibleIndex of map.spokenToVisible) {
      freq.set(visibleIndex, (freq.get(visibleIndex) || 0) + 1);
    }
    expect(map.spokenWordCount).toBeGreaterThan(map.visibleWordCount);
    expect([...freq.values()].some((count) => count >= 3)).toBe(true);
  });

  it('maps Pvt. Ltd. expansion without running ahead of visible words', () => {
    const map = buildSpokenToVisibleWordMap('NITSAN Pvt. Ltd. works.');
    expect(map.visibleWordCount).toBe(4);
    expect(map.spokenToVisible.every((v) => v >= 0 && v < map.visibleWordCount)).toBe(true);
    // Spoken stream is longer or equal; never maps past last visible word
    expect(Math.max(...map.spokenToVisible)).toBeLessThan(map.visibleWordCount);
  });

  it('keeps German z.B. spoken→visible indices in range', () => {
    const map = buildSpokenToVisibleWordMap('Nutze z.B. React hier.');
    expect(map.spokenToVisible.every((v) => v >= 0 && v < map.visibleWordCount)).toBe(true);
    expect(Math.max(...map.spokenToVisible)).toBe(map.visibleWordCount - 1);
  });
});

describe('baseWordsPerMinuteForLanguage', () => {
  it('uses a slower baseline for German than English', () => {
    expect(baseWordsPerMinuteForLanguage('de')).toBeLessThan(baseWordsPerMinuteForLanguage('en'));
    expect(baseWordsPerMinuteForLanguage('de-DE')).toBe(145);
    expect(baseWordsPerMinuteForLanguage('en')).toBe(160);
  });
});
