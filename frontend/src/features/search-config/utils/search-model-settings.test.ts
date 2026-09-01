import {
  formatConnectionTestError,
  formatSplitConnectionTestResult,
  hasUsableSavedApiKeyForProvider,
  resolveApiKeyForConnectionTest,
  resolveApiKeyForPersist,
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

  it('passes through Mistral scoped-model guidance', () => {
    const raw =
      "Failed: Access denied for 'mistral-large-latest'. Your key is scoped to other chat models: mistral-small-latest. Select one of these in Chat model, then save and test again.";
    const formatted = formatConnectionTestError(raw);
    expect(formatted).toContain('mistral-small-latest');
    expect(formatted).not.toContain('Failed:');
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

describe('resolveApiKeyForPersist', () => {
  const validKey = 'mistral-secret-key-abcdefghijklmnopqrst';

  it('prefers pending plaintext over masked draft display', () => {
    const result = resolveApiKeyForPersist({
      draftKey: 'abcd********wxyz',
      pendingPlaintextKey: validKey,
      hasSavedKey: true,
      provider: 'mistral',
    });
    expect(result.apiKeyToSave).toBe(validKey);
  });

  it('blocks silent save when editing but only mask is visible', () => {
    const result = resolveApiKeyForPersist({
      draftKey: 'abcd********wxyz',
      hasSavedKey: true,
      provider: 'mistral',
      apiKeyEditing: true,
    });
    expect(result.error).toContain('was not saved');
  });

  it('allows unchanged save when not editing and mask is shown', () => {
    const result = resolveApiKeyForPersist({
      draftKey: 'abcd********wxyz',
      hasSavedKey: true,
      provider: 'mistral',
      apiKeyEditing: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.apiKeyToSave).toBeUndefined();
  });
});

describe('resolveApiKeyForConnectionTest', () => {
  it('uses pending plaintext instead of stored-key fallback', () => {
    const result = resolveApiKeyForConnectionTest({
      draftKey: 'abcd********wxyz',
      pendingPlaintextKey: 'mistral-secret-key-abcdefghijklmnopqrst',
    });
    expect(result.useStored).toBe(false);
    expect(result.apiKey).toBe('mistral-secret-key-abcdefghijklmnopqrst');
  });

  it('falls back to stored key for masked display', () => {
    const result = resolveApiKeyForConnectionTest({
      draftKey: 'abcd********wxyz',
    });
    expect(result.useStored).toBe(true);
    expect(result.apiKey).toBe('');
  });
});

describe('formatSplitConnectionTestResult', () => {
  it('reports chat failure when embedding succeeds', () => {
    const result = formatSplitConnectionTestResult(
      {
        chat_model: 'Failed: Status 403 Forbidden',
        embedding_model: 'Success: Vector of length 1024 generated',
      },
      { embeddingModel: 'mistral-embed' },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Chat model:');
    expect(result.message).toContain('Embedding model: connection OK');
  });
});
