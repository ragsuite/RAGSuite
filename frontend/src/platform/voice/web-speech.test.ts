/**
 * Re-exports EE web-speech unit coverage when RAGSUITE_EE is present.
 * Imports the module under test (not the EE test file) so Jest transforms cleanly.
 */
import {
  buildSpeechSegments,
  estimateUtteranceDurationMs,
  selectProfessionalVoice,
  toSpeechLocale,
} from '@ragsuite-ee/modules/voice/frontend/web-speech';

describe('toSpeechLocale (EE)', () => {
  it('maps widget language codes to BCP-47', () => {
    expect(toSpeechLocale('en')).toBe('en-US');
    expect(toSpeechLocale('en-us')).toBe('en-US');
    expect(toSpeechLocale('en_in')).toBe('en-IN');
    expect(toSpeechLocale('en-gb')).toBe('en-GB');
    expect(toSpeechLocale('hi')).toBe('hi-IN');
    expect(toSpeechLocale('es')).toBe('es-ES');
    expect(toSpeechLocale('fr')).toBe('fr-FR');
    expect(toSpeechLocale('de')).toBe('de-DE');
    expect(toSpeechLocale('ar')).toBe('ar-SA');
    expect(toSpeechLocale('pt')).toBe('pt-PT');
    expect(toSpeechLocale('pt-br')).toBe('pt-BR');
    expect(toSpeechLocale('zh')).toBe('zh-CN');
    expect(toSpeechLocale('zh-cn')).toBe('zh-CN');
    expect(toSpeechLocale('zh-tw')).toBe('zh-TW');
    expect(toSpeechLocale(null)).toBe('en-US');
  });

  it('maps every chatbot language option key to the expected BCP-47 tag', () => {
    const chatKeys: Record<string, string> = {
      en: 'en-US',
      'en-gb': 'en-GB',
      hi: 'hi-IN',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      ar: 'ar-SA',
      pt: 'pt-PT',
      zh: 'zh-CN',
    };
    for (const [key, expected] of Object.entries(chatKeys)) {
      expect(toSpeechLocale(key)).toBe(expected);
    }
  });

  it('maps every search language option key to the expected BCP-47 tag', () => {
    const searchKeys: Record<string, string> = {
      'en-us': 'en-US',
      'en-gb': 'en-GB',
      hi: 'hi-IN',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      ar: 'ar-SA',
      'pt-br': 'pt-BR',
      'zh-cn': 'zh-CN',
    };
    for (const [key, expected] of Object.entries(searchKeys)) {
      expect(toSpeechLocale(key)).toBe(expected);
    }
  });
});

describe('selectProfessionalVoice (EE)', () => {
  it('prefers Hindi voices for hi-IN and never picks English when Hindi exists', () => {
    const picked = selectProfessionalVoice('hi-IN', [
      { name: 'Google US English', lang: 'en-US', localService: false },
      { name: 'Google हिन्दी', lang: 'hi-IN', localService: false },
      { name: 'Microsoft Heera', lang: 'hi', localService: true },
    ]);
    expect(picked?.name).toMatch(/हिन्दी|Heera|Hindi/i);
    expect(picked?.lang.toLowerCase().startsWith('en')).toBe(false);
  });

  it('returns null for hi-IN when only English voices are installed', () => {
    const picked = selectProfessionalVoice('hi-IN', [
      { name: 'Google US English', lang: 'en-US', localService: false },
      { name: 'Samantha', lang: 'en-US', localService: true },
    ]);
    expect(picked).toBeNull();
  });

  it('matches bare hi lang tag for Hindi', () => {
    const picked = selectProfessionalVoice('hi-IN', [
      { name: 'Google Hindi', lang: 'hi', localService: false },
    ]);
    expect(picked?.name).toBe('Google Hindi');
  });

  it('prefers premium US English for en-US', () => {
    const picked = selectProfessionalVoice('en-US', [
      { name: 'Compact Voice', lang: 'en-US', default: true, localService: true },
      { name: 'Google US English', lang: 'en-US', localService: false },
    ]);
    expect(picked?.name).toBe('Google US English');
  });
});

describe('buildSpeechSegments smoke (EE)', () => {
  it('keeps Hindi headings speakable', () => {
    const segments = buildSpeechSegments('NITSAN क्या है?\nTYPO3 एजेंसी');
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments[0].text).toContain('NITSAN');
  });
});

describe('estimateUtteranceDurationMs (EE)', () => {
  it('keeps English estimate unchanged vs default', () => {
    const text = 'one two three four five';
    expect(estimateUtteranceDurationMs(text, 1, 'en-US')).toBe(
      estimateUtteranceDurationMs(text, 1),
    );
  });

  it('estimates longer duration for Hindi than English at same word count', () => {
    const text = 'one two three four five six seven eight';
    const en = estimateUtteranceDurationMs(text, 1, 'en');
    const hi = estimateUtteranceDurationMs(text, 1, 'hi-IN');
    expect(hi).toBeGreaterThan(en);
  });
});
