import {
  buildSavedApiKeyFieldDisplay,
  formatApiKeyFieldDisplay,
  lookupProviderApiKeyMask,
  parseProviderApiKeysMap,
  resolveApiKeyFieldValue,
  resolveApiKeyMaskedPresence,
} from '@/features/search-config/utils/search-settings-api';
import { hasUsableSavedApiKeyForProvider } from '@/features/search-config/utils/search-model-settings';

describe('resolveApiKeyMaskedPresence', () => {
  it('does not keep a previous project mask when the API returns empty api_key', () => {
    expect(
      resolveApiKeyMaskedPresence({
        apiKey: null,
        apiKeyMasked: null,
        current: 'mist...KEY1',
      }),
    ).toBe('');
  });

  it('uses the masked api_key from the API response', () => {
    expect(
      resolveApiKeyMaskedPresence({
        apiKey: 'abcd...wxyz',
        current: 'oldd...OLD1',
      }),
    ).toBe('abcd...wxyz');
  });
});

describe('formatApiKeyFieldDisplay', () => {
  it('renders professional star masking from backend ellipsis masks', () => {
    expect(formatApiKeyFieldDisplay('abcd...wxyz')).toBe('abcd********wxyz');
  });

  it('converts bullet markers to stars', () => {
    expect(formatApiKeyFieldDisplay(`abcd${'•'.repeat(10)}`)).toBe(`abcd${'*'.repeat(10)}`);
  });

  it('never renders a full plaintext provider key', () => {
    const plaintext = 'IFssXnRPAZabcdefghijklmnopqrstPXlH8fnJBkO5QWD';
    expect(formatApiKeyFieldDisplay(plaintext)).toBe(`IFss${'*'.repeat(10)}`);
    expect(formatApiKeyFieldDisplay(plaintext)).not.toContain('PXlH8fnJBkO5QWD');
  });
});

describe('provider api key map helpers', () => {
  it('parses and looks up provider families', () => {
    const map = parseProviderApiKeysMap({
      mistral: 'mist...KEY1',
      'google-gemini': 'AIza...xyz1',
    });
    expect(lookupProviderApiKeyMask(map, 'mistral')).toBe('mist...KEY1');
    expect(lookupProviderApiKeyMask(map, 'gemini')).toBe('AIza...xyz1');
    expect(lookupProviderApiKeyMask(map, 'openai')).toBe('');
  });

  it('treats provider_api_keys as saved for draft provider', () => {
    expect(
      hasUsableSavedApiKeyForProvider({
        apiKeyMasked: '',
        savedProvider: 'openai',
        draftProvider: 'mistral',
        providerApiKeys: { mistral: 'mist...KEY1' },
      }),
    ).toBe(true);
  });
});

describe('resolveApiKeyFieldValue', () => {
  it('shows masked value when saved key exists and field is idle', () => {
    const value = resolveApiKeyFieldValue({
      draftApiKey: 'IFssXnRPAZabcdefghijklmnopqrstPXlH8fnJBkO5QWD',
      providerApiKeys: { mistral: 'IFss...QWD1' },
      provider: 'mistral',
      apiKeyMasked: 'IFss...QWD1',
      hasSavedApiKey: true,
      isEditing: false,
      isOllama: false,
    });
    expect(value).toBe('IFss********QWD1');
  });
});
