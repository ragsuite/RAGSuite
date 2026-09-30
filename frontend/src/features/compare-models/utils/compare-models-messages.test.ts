import {
  canToggleCompareProfile,
  getConfiguredSourceCaption,
  getEmptyProfilesMessage,
  isReadOnlyCompareProfile,
  isReadOnlyCompareProfileDelete,
  isSessionToggleCompareProfile,
} from '@/features/compare-models/utils/compare-models-messages';
import {
  enabledProviderKeys,
  mapProviderFromApi,
  providerLabelFromApi,
} from '@/features/compare-models/utils/compare-model-providers';
import { parseSearchModelProfilesResponse } from '@/features/compare-models/utils/compare-model-profiles';

const t = (key: string) => key;

describe('compare models — Model Configuration providers', () => {
  it('uses provider copy for the providers source', () => {
    expect(getEmptyProfilesMessage(t, 'providers', true)).toBe('compareModels.empty.providers');
    expect(getEmptyProfilesMessage(t, 'providers', false)).toBe('compareModels.empty.noProject');
    expect(getConfiguredSourceCaption(t, 'providers')).toBe('compareModels.source.providers');
  });

  it('keeps legacy source copy unchanged', () => {
    expect(getEmptyProfilesMessage(t, 'chat', true)).toBe('compareModels.empty.chat');
    expect(getConfiguredSourceCaption(t, 'search')).toBe('compareModels.source.search');
    expect(getConfiguredSourceCaption(t, null)).toBeNull();
  });

  it('provider rows toggle per session but are never persisted or deleted', () => {
    const id = 'provider:mistral';
    expect(isSessionToggleCompareProfile(id)).toBe(true);
    expect(isReadOnlyCompareProfile(id, true)).toBe(true);
    expect(isReadOnlyCompareProfileDelete(id, true)).toBe(true);
    expect(canToggleCompareProfile(id, true)).toBe(true);
  });

  it('legacy runtime rows stay locked and saved profiles stay editable', () => {
    expect(canToggleCompareProfile('chatbot:proj-1', true)).toBe(false);
    expect(canToggleCompareProfile('chat:proj-1')).toBe(false);
    expect(canToggleCompareProfile('3f1c7d2e-0000-4000-8000-000000000000', false)).toBe(true);
    expect(isReadOnlyCompareProfileDelete('3f1c7d2e-0000-4000-8000-000000000000', false)).toBe(false);
  });

  it('maps provider keys and labels, including gemini', () => {
    expect(mapProviderFromApi('gemini')).toBe('google-gemini');
    expect(mapProviderFromApi('google-gemini')).toBe('google-gemini');
    expect(mapProviderFromApi('OpenAI')).toBe('openai');
    expect(mapProviderFromApi('something-else')).toBe('custom-llm');
    expect(providerLabelFromApi('gemini')).toBe('Google Gemini');
    expect(providerLabelFromApi('openai')).toBe('OpenAI');
    expect(providerLabelFromApi('ollama')).toBe('Ollama');
    expect(providerLabelFromApi('unknown')).toBe('unknown');
  });

  it('sends only enabled provider keys, or nothing for legacy rows', () => {
    expect(
      enabledProviderKeys([
        { providerKey: 'mistral', enabled: true },
        { providerKey: 'ollama', enabled: false },
      ]),
    ).toEqual(['mistral']);
    expect(enabledProviderKeys([{ providerKey: 'mistral', enabled: false }])).toEqual([]);
    expect(enabledProviderKeys([{ enabled: true }])).toBeUndefined();
    expect(enabledProviderKeys([])).toBeUndefined();
  });

  it('parses the providers list response', () => {
    const parsed = parseSearchModelProfilesResponse({
      success: true,
      data: {
        configured_source: 'providers',
        effective_source: 'providers',
        profiles: [{ id: 'provider:mistral', provider: 'mistral', model_name: 'mistral-large-latest', provider_key: 'mistral' }],
      },
    });
    expect(parsed?.configured_source).toBe('providers');
    expect(parsed?.profiles[0]?.provider_key).toBe('mistral');
  });
});
