import { emptySplitConfig, parseSplitConfig, toDocumentSplitMetadata, toSplitConfigApi } from '@/features/crawl/utils/split-config';

describe('split config mappers', () => {
  it('defaults missing config to native and hides custom fields on upload', () => {
    expect(parseSplitConfig(undefined, 'document').splitMode).toBe('native');
    expect(parseSplitConfig({ mode: 'native' }, 'web').splitMode).toBe('native');
    expect(toDocumentSplitMetadata(emptySplitConfig('document'), { omitNative: true })).toEqual({});
    expect(toSplitConfigApi(emptySplitConfig('web'), { omitNative: true })).toBeUndefined();
  });

  it('keeps Domain/Sitemap kind defaults at web 900/120', () => {
    expect(emptySplitConfig('web')).toMatchObject({ chunkSize: 900, chunkOverlap: 120, splitMode: 'native' });
  });

  it('serializes custom ||| as the last list option', () => {
    const form = {
      splitMode: 'custom' as const,
      chunkSize: 800,
      chunkOverlap: 200,
      delimiterPreset: 'custom' as const,
      delimiterCustom: '|||',
    };
    expect(toSplitConfigApi(form)).toEqual({
      mode: 'custom',
      chunk_size: 800,
      chunk_overlap: 200,
      delimiter_preset: 'custom',
      delimiter_custom: '|||',
    });
    expect(toDocumentSplitMetadata(form, { omitNative: true })).toMatchObject({
      split_mode: 'custom',
      chunk_delimiter_preset: 'custom',
      chunk_delimiter_custom: '|||',
    });
  });
});
