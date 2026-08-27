import {
  formatConnectionTestError,
  hasUsableSavedApiKeyForProvider,
} from '@/features/search-config/utils/search-model-settings';

describe('formatConnectionTestError', () => {
  it('passes through hosted API key required messages', () => {
    const raw =
      'Failed: API key required for gemini. Add a valid gemini API key to test this model. ' +
      'Runtime would fall back to a local Ollama model, which does not need an API key.';
    const formatted = formatConnectionTestError(raw);
    expect(formatted).toContain('API key required for gemini');
    expect(formatted).toContain('does not need an API key');
    expect(formatted).not.toContain('Failed:');
  });

  it('still maps auth failures to a short invalid-key message', () => {
    expect(formatConnectionTestError('Failed: 401 Unauthorized')).toBe(
      'Invalid API key. Check that the key matches the selected provider.',
    );
  });

  it('maps probe/client timeouts to a clearer provider message', () => {
    expect(formatConnectionTestError('Failed: Timed out after 12s')).toContain(
      'API key may still be valid',
    );
    expect(formatConnectionTestError('timeout of 15000ms exceeded')).toContain(
      'API key may still be valid',
    );
  });
});

describe('hasUsableSavedApiKeyForProvider', () => {
  it('requires matching provider families', () => {
    expect(
      hasUsableSavedApiKeyForProvider({
        apiKeyMasked: 'rag-...HWJ4',
        savedProvider: 'ollama',
        draftProvider: 'gemini',
      }),
    ).toBe(false);

    expect(
      hasUsableSavedApiKeyForProvider({
        apiKeyMasked: 'AIza...xyz1',
        savedProvider: 'gemini',
        draftProvider: 'google',
      }),
    ).toBe(true);

    expect(
      hasUsableSavedApiKeyForProvider({
        apiKeyMasked: '',
        savedProvider: 'gemini',
        draftProvider: 'gemini',
      }),
    ).toBe(false);
  });

  it('accepts providerApiKeys for a different saved active provider', () => {
    expect(
      hasUsableSavedApiKeyForProvider({
        apiKeyMasked: 'sk-o...OPEN',
        savedProvider: 'openai',
        draftProvider: 'mistral',
        providerApiKeys: { mistral: 'mist...KEY1' },
      }),
    ).toBe(true);
  });
});
