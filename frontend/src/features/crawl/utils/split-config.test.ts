import {
  emptySplitConfig,
  parseSplitConfig,
  toDocumentSplitMetadata,
  toSplitConfigApi,
  type SplitConfigForm,
} from '@/features/crawl/utils/split-config';

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
    const form: SplitConfigForm = {
      splitMode: 'custom',
      chunkSize: 800,
      chunkOverlap: 200,
      delimiterPreset: 'custom',
      delimiterPresets: ['custom'],
      delimiterCustom: '|||',
      parentChild: false,
      tableContext: 0,
      excelAsHtml: false,
    };
    expect(toSplitConfigApi(form)).toEqual({
      mode: 'custom',
      chunk_size: 800,
      chunk_overlap: 200,
      delimiter_preset: 'custom',
      delimiter_presets: ['custom'],
      delimiter_custom: '|||',
    });
    expect(toDocumentSplitMetadata(form, { omitNative: true })).toMatchObject({
      split_mode: 'custom',
      chunk_delimiter_preset: 'custom',
      chunk_delimiter_presets: 'custom',
      chunk_delimiter_custom: '|||',
    });
    expect(toSplitConfigApi(form)).not.toHaveProperty('parent_child');
    expect(toSplitConfigApi({ ...form, parentChild: true, tableContext: 1, excelAsHtml: true })).toMatchObject({
      parent_child: true,
      table_context: 1,
      excel_as_html: true,
    });
  });

  it('round-trips multi presets and caption on as 2', () => {
    const parsed = parseSplitConfig(
      {
        mode: 'custom',
        chunk_size: 800,
        chunk_overlap: 200,
        delimiter_preset: 'paragraph',
        delimiter_presets: ['paragraph', 'heading', 'custom'],
        delimiter_custom: '|||, Chapter',
        table_context: 2,
      },
      'document',
    );
    expect(parsed).toMatchObject({
      delimiterPreset: 'paragraph',
      delimiterPresets: ['paragraph', 'heading', 'custom'],
      delimiterCustom: '|||, Chapter',
      tableContext: 2,
    });
    expect(toSplitConfigApi(parsed)).toMatchObject({
      delimiter_preset: 'paragraph',
      delimiter_presets: ['paragraph', 'heading', 'custom'],
      delimiter_custom: '|||, Chapter',
      table_context: 2,
    });
    expect(toDocumentSplitMetadata(parsed)).toMatchObject({
      chunk_delimiter_preset: 'paragraph',
      chunk_delimiter_presets: 'paragraph,heading,custom',
      table_context: 2,
    });
  });
});
