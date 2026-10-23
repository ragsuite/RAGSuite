export type SplitMode = 'native' | 'custom';
export type DelimiterPreset =
  | 'paragraph'
  | 'sentence'
  | 'newline'
  | 'question'
  | 'exclaim'
  | 'semicolon'
  | 'custom';
export type SplitSourceKind = 'document' | 'web' | 'text' | 'qa';

export type SplitConfigForm = {
  splitMode: SplitMode;
  chunkSize: number;
  chunkOverlap: number;
  delimiterPreset: DelimiterPreset;
  delimiterCustom: string;
};

export const DELIMITER_PRESET_ORDER: readonly DelimiterPreset[] = [
  'paragraph',
  'sentence',
  'newline',
  'question',
  'exclaim',
  'semicolon',
  'custom',
];

const DEFAULTS: Record<SplitSourceKind, { chunkSize: number; chunkOverlap: number }> = {
  document: { chunkSize: 800, chunkOverlap: 280 },
  web: { chunkSize: 900, chunkOverlap: 120 },
  text: { chunkSize: 1500, chunkOverlap: 200 },
  qa: { chunkSize: 2200, chunkOverlap: 80 },
};

const PRESETS = new Set<DelimiterPreset>(DELIMITER_PRESET_ORDER);

export function emptySplitConfig(kind: SplitSourceKind): SplitConfigForm {
  return {
    splitMode: 'native',
    ...DEFAULTS[kind],
    delimiterPreset: 'paragraph',
    delimiterCustom: '',
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function parseSplitConfig(raw: unknown, kind: SplitSourceKind): SplitConfigForm {
  const defaults = emptySplitConfig(kind);
  const record = asRecord(raw);
  const nested = asRecord(record?.split_config) ?? asRecord(record?.splitConfig) ?? record;
  if (!nested) return defaults;
  const mode = String(nested.mode ?? nested.splitMode ?? 'native').trim().toLowerCase();
  if (mode !== 'custom') return defaults;
  const presetRaw = String(nested.delimiter_preset ?? nested.delimiterPreset ?? 'paragraph')
    .trim()
    .toLowerCase();
  const preset = PRESETS.has(presetRaw as DelimiterPreset) ? (presetRaw as DelimiterPreset) : 'paragraph';
  return {
    splitMode: 'custom',
    chunkSize: asInt(nested.chunk_size ?? nested.chunkSize, defaults.chunkSize),
    chunkOverlap: asInt(nested.chunk_overlap ?? nested.chunkOverlap, defaults.chunkOverlap),
    delimiterPreset: preset,
    delimiterCustom: String(nested.delimiter_custom ?? nested.delimiterCustom ?? ''),
  };
}

export function toSplitConfigApi(
  form: SplitConfigForm,
  options?: { omitNative?: boolean },
): Record<string, unknown> | undefined {
  if (form.splitMode !== 'custom') {
    return options?.omitNative ? undefined : { mode: 'native' };
  }
  return {
    mode: 'custom',
    chunk_size: form.chunkSize,
    chunk_overlap: form.chunkOverlap,
    delimiter_preset: form.delimiterPreset,
    delimiter_custom: form.delimiterPreset === 'custom' ? form.delimiterCustom : null,
  };
}

export function toDocumentSplitMetadata(
  form: Pick<SplitConfigForm, 'splitMode' | 'chunkSize' | 'chunkOverlap' | 'delimiterPreset' | 'delimiterCustom'>,
  options?: { omitNative?: boolean },
): Record<string, string | number | null> {
  if (form.splitMode !== 'custom') {
    return options?.omitNative ? {} : { split_mode: 'native' };
  }
  return {
    split_mode: 'custom',
    chunk_size: form.chunkSize,
    chunk_overlap: form.chunkOverlap,
    chunk_delimiter_preset: form.delimiterPreset,
    chunk_delimiter_custom: form.delimiterPreset === 'custom' ? form.delimiterCustom : null,
  };
}
