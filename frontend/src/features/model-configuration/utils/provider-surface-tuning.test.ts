import {
  buildSurfaceTuningDrafts,
  buildSurfaceTuningPayload,
  DEFAULT_TEMPERATURE,
  mapSurfaceTuning,
  maxTemperatureFor,
  resolveSurfaceTuningDraft,
  resolveTemperature,
} from '@/features/model-configuration/utils/provider-surface-tuning';

const EMPTY = { temperature: null, similarityThreshold: null, maxTokens: null };

describe('provider surface tuning', () => {
  it('falls back to the legacy shared temperature for both surfaces', () => {
    expect(mapSurfaceTuning({ provider: 'openai', temperature: '0.4' })).toEqual({
      chat: { temperature: 0.4, similarityThreshold: null, maxTokens: null },
      search: { temperature: 0.4, similarityThreshold: null, maxTokens: null },
    });
  });

  it('prefers per-surface values over the legacy temperature', () => {
    const surfaces = mapSurfaceTuning({
      provider: 'openai',
      temperature: '0.4',
      surfaces: { search: { temperature: '1.1', similarity_threshold: '0.6', max_tokens: '1800' } },
    });
    expect(surfaces.chat.temperature).toBe(0.4);
    expect(surfaces.search).toEqual({ temperature: 1.1, similarityThreshold: 0.6, maxTokens: 1800 });
  });

  it('caps temperature at the provider maximum', () => {
    expect(maxTemperatureFor('anthropic')).toBe(1);
    expect(maxTemperatureFor('openai')).toBe(2);
    expect(resolveTemperature('anthropic', 1.6)).toBe(1);
    expect(resolveTemperature('openai', 1.6)).toBe(1.6);
    expect(resolveTemperature('openai', -1)).toBe(0);
  });

  it('fills unset values with the same defaults the widgets use', () => {
    expect(buildSurfaceTuningDrafts('mistral', { chat: EMPTY, search: EMPTY })).toEqual({
      chat: { temperature: DEFAULT_TEMPERATURE, similarityThreshold: 0.45, maxTokens: 800 },
      search: { temperature: DEFAULT_TEMPERATURE, similarityThreshold: 0.5, maxTokens: 1000 },
    });
  });

  it('clamps saved values to each surface range', () => {
    const saved = { temperature: 1.5, similarityThreshold: 0.9, maxTokens: 100 };
    expect(resolveSurfaceTuningDraft('mistral', 'chat', saved)).toEqual({
      temperature: 1,
      similarityThreshold: 0.45,
      maxTokens: 500,
    });
    expect(resolveSurfaceTuningDraft('openai', 'search', saved)).toEqual({
      temperature: 1.5,
      similarityThreshold: 0.9,
      maxTokens: 400,
    });
  });

  it('builds a rounded flat payload per surface', () => {
    const payload = buildSurfaceTuningPayload('openai', {
      chat: { temperature: 0.1 + 0.2, similarityThreshold: 0.35000000001, maxTokens: 850.4 },
      search: { temperature: 1.2, similarityThreshold: 0.6, maxTokens: 2000 },
    });
    expect(payload).toEqual({
      chat_temperature: 0.3,
      search_temperature: 1.2,
      chat_similarity_threshold: 0.35,
      search_similarity_threshold: 0.6,
      chat_max_tokens: 850,
      search_max_tokens: 2000,
    });
  });
});
