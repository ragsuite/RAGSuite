import { formatEmbeddedModelDetailLabel } from '@/features/crawl/utils/format-embedded-model-detail-label';

describe('formatEmbeddedModelDetailLabel', () => {
  it('uses Chroma provider and model even when is_active', () => {
    expect(
      formatEmbeddedModelDetailLabel({
        provider: 'mistral',
        model: 'mistral-embed',
        collection: 'proj_mistral',
        is_active: true,
      }),
    ).toBe('mistral / mistral-embed');
  });

  it('does not substitute a different project active model', () => {
    expect(
      formatEmbeddedModelDetailLabel({
        provider: 'openai',
        model: 'text-embedding-3-small',
        collection: 'proj_openai',
        is_active: true,
      }),
    ).toBe('openai / text-embedding-3-small');
  });

  it('falls back to collection when provider/model missing', () => {
    expect(
      formatEmbeddedModelDetailLabel({
        provider: null,
        model: null,
        collection: 'proj_unknown',
        is_active: false,
      }),
    ).toBe('proj_unknown');
  });
});
