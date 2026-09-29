import type {
  ModelProviderKey,
  ProviderCatalogEntry,
} from '@/features/model-configuration/types/model-configuration.types';
import { mapProviderConfig } from '@/features/model-configuration/utils/model-configuration.mappers';
import {
  applyProviderToWidgetSettings,
  resolveUnavailableWidgetProvider,
  resolveWidgetProviderEntry,
} from '@/features/model-configuration/utils/widget-provider-selection';

function entry(key: ModelProviderKey, label: string, config: Record<string, unknown>): ProviderCatalogEntry {
  return {
    key,
    label,
    chatModels: [],
    embeddingModels: [],
    config: mapProviderConfig({ provider: key, ...config }, key),
  };
}

const openai = entry('openai', 'OpenAI', { configured: false, has_api_key: true, key_rejected: true, chat_model: 'gpt-4o-mini' });
const mistral = entry('mistral', 'Mistral', { configured: true, has_api_key: true, chat_model: 'ministral-8b-latest' });
const gemini = entry('gemini', 'Google Gemini', { configured: false });
const all = [openai, mistral, gemini];
const configured = all.filter((p) => p.config.configured);

describe('widget provider selection', () => {
  it('flags a widget whose saved provider key was rejected', () => {
    expect(resolveUnavailableWidgetProvider('openai', all)).toEqual({ label: 'OpenAI', reason: 'keyRejected' });
  });

  it('flags a widget whose saved provider is not configured', () => {
    expect(resolveUnavailableWidgetProvider('google-gemini', all)).toEqual({
      label: 'Google Gemini',
      reason: 'notConfigured',
    });
  });

  it('does not flag a configured or unknown provider', () => {
    expect(resolveUnavailableWidgetProvider('mistral', all)).toBeNull();
    expect(resolveUnavailableWidgetProvider(null, all)).toBeNull();
    expect(resolveUnavailableWidgetProvider('cohere', all)).toBeNull();
  });

  it('only offers configured providers for selection', () => {
    expect(resolveWidgetProviderEntry('openai', configured)?.key).toBe('mistral');
    expect(resolveWidgetProviderEntry('mistral', configured)?.key).toBe('mistral');
  });

  it('mirrors provider models and leaves other widget fields alone', () => {
    const widget = { provider: 'openai', chatModel: 'gpt-4o', embeddingModel: 'text-embedding-3-small', topKResults: 7 };
    expect(applyProviderToWidgetSettings(widget, mistral)).toEqual({
      provider: 'mistral',
      chatModel: 'ministral-8b-latest',
      embeddingModel: 'text-embedding-3-small',
      topKResults: 7,
    });
  });
});
