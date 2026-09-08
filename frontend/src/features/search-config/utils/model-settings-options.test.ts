import {
  ensureModelOptionPresent,
  normalizeModelProviderKey,
  resolveChatModelsForProvider,
} from '@/features/search-config/utils/model-settings-options';

describe('ensureModelOptionPresent', () => {
  it('appends a missing selected model so auto-reset cannot wipe it', () => {
    const options = [{ key: 'gpt-4o', label: 'GPT-4o' }];
    const next = ensureModelOptionPresent(options, 'my-custom-saved');
    expect(next).toEqual([
      { key: 'gpt-4o', label: 'GPT-4o' },
      { key: 'my-custom-saved', label: 'my-custom-saved' },
    ]);
  });

  it('does not duplicate an existing selection', () => {
    const options = [{ key: 'gpt-4o', label: 'GPT-4o' }];
    expect(ensureModelOptionPresent(options, 'gpt-4o')).toEqual(options);
  });
});

describe('resolveChatModelsForProvider', () => {
  it('keeps expanded mistral models and preserves selection', () => {
    const models = resolveChatModelsForProvider('mistral', null, 'codestral-latest');
    expect(models.some((m) => m.key === 'codestral-latest')).toBe(true);
    expect(models.some((m) => m.key === 'mistral-large-latest')).toBe(true);
    expect(models.some((m) => m.key === 'mistral-large')).toBe(true);
  });

  it('reads gemini models from either google-gemini or gemini API keys', () => {
    const available = {
      providers: [{ key: 'gemini', label: 'Google Gemini' }],
      chatModelsByProvider: {
        gemini: [{ key: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }],
      },
      embeddingModelsByProvider: {},
    };
    const models = resolveChatModelsForProvider('google-gemini', available, 'gemini-1.5-pro');
    expect(models.some((m) => m.key === 'gemini-2.5-flash')).toBe(true);
    expect(models.some((m) => m.key === 'gemini-1.5-pro')).toBe(true);
  });
});

describe('normalizeModelProviderKey', () => {
  it('maps gemini aliases to google-gemini', () => {
    expect(normalizeModelProviderKey('gemini')).toBe('google-gemini');
    expect(normalizeModelProviderKey('google-gemini')).toBe('google-gemini');
  });
});
