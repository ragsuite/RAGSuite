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
export type TableContext = 0 | 1 | 2;

export type SplitConfigForm = {
  splitMode: SplitMode;
  chunkSize: number;
  chunkOverlap: number;
  delimiterPreset: DelimiterPreset;
  delimiterCustom: string;
  parentChild: boolean;
  tableContext: TableContext;
  excelAsHtml: boolean;
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
    parentChild: false,
    tableContext: 0,
    excelAsHtml: false,
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

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function asTableContext(value: unknown): TableContext {
  const n = asInt(value, 0);
  return n === 1 || n === 2 ? n : 0;
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
    parentChild: asBool(nested.parent_child ?? nested.parentChild),
    tableContext: asTableContext(nested.table_context ?? nested.tableContext),
    excelAsHtml: asBool(nested.excel_as_html ?? nested.excelAsHtml),
  };
}

export function toSplitConfigApi(
  form: SplitConfigForm,
  options?: { omitNative?: boolean },
): Record<string, unknown> | undefined {
  if (form.splitMode !== 'custom') {
    return options?.omitNative ? undefined : { mode: 'native' };
  }
  const payload: Record<string, unknown> = {
    mode: 'custom',
    chunk_size: form.chunkSize,
    chunk_overlap: form.chunkOverlap,
    delimiter_preset: form.delimiterPreset,
    delimiter_custom: form.delimiterPreset === 'custom' ? form.delimiterCustom : null,
  };
  if (form.parentChild) payload.parent_child = true;
  if (form.tableContext === 1 || form.tableContext === 2) payload.table_context = form.tableContext;
  if (form.excelAsHtml) payload.excel_as_html = true;
  return payload;
}

export function toDocumentSplitMetadata(
  form: SplitConfigForm,
  options?: { omitNative?: boolean },
): Record<string, string | number | boolean | null> {
  if (form.splitMode !== 'custom') {
    return options?.omitNative ? {} : { split_mode: 'native' };
  }
  const payload: Record<string, string | number | boolean | null> = {
    split_mode: 'custom',
    chunk_size: form.chunkSize,
    chunk_overlap: form.chunkOverlap,
    chunk_delimiter_preset: form.delimiterPreset,
    chunk_delimiter_custom: form.delimiterPreset === 'custom' ? form.delimiterCustom : null,
  };
  if (form.parentChild) payload.parent_child = true;
  if (form.tableContext === 1 || form.tableContext === 2) payload.table_context = form.tableContext;
  if (form.excelAsHtml) payload.excel_as_html = true;
  return payload;
}
