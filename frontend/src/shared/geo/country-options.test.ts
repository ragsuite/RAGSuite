import {
  defaultTimezoneForCountry,
  flagEmoji,
  isSingleTimezoneCountry,
  matchesCountryQuery,
  timezonesForCountry,
} from '@/shared/geo/country-options';

describe('defaultTimezoneForCountry', () => {
  it('auto-selects when the country has a single zone', () => {
    const code = ['JM', 'JP', 'IS', 'PR'].find((item) => timezonesForCountry(item).length === 1);
    expect(code).toBeDefined();
    expect(defaultTimezoneForCountry(code!)).toBe(timezonesForCountry(code!)[0]);
    expect(isSingleTimezoneCountry(code!)).toBe(true);
  });

  it('leaves timezone empty when the country has multiple zones', () => {
    expect(timezonesForCountry('US').length).toBeGreaterThan(1);
    expect(defaultTimezoneForCountry('US')).toBe('');
    expect(isSingleTimezoneCountry('DE')).toBe(false);
  });
});

describe('country flags and search', () => {
  it('builds a regional-indicator flag emoji', () => {
    expect(flagEmoji('DE')).toBe('🇩🇪');
    expect(flagEmoji('IN')).toBe('🇮🇳');
  });

  it('matches country name, ISO code, or dial code', () => {
    const germany = { code: 'DE' as const, name: 'Germany', dialCode: '+49', flag: '🇩🇪' };
    expect(matchesCountryQuery(germany, 'ger')).toBe(true);
    expect(matchesCountryQuery(germany, 'de')).toBe(true);
    expect(matchesCountryQuery(germany, '+49')).toBe(true);
    expect(matchesCountryQuery(germany, 'us')).toBe(false);
  });
});
