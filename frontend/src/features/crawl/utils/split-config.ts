export type SplitMode = 'native' | 'custom';
export type DelimiterPreset =
  | 'paragraph'
  | 'sentence'
  | 'newline'
  | 'heading'
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
  delimiterPresets: DelimiterPreset[];
  delimiterCustom: string;
  parentChild: boolean;
  tableContext: TableContext;
  excelAsHtml: boolean;
};

export const DELIMITER_PRESET_ORDER: readonly DelimiterPreset[] = [
  'paragraph',
  'sentence',
  'newline',
  'heading',
  'question',
  'exclaim',
  'semicolon',
  'custom',
];

export const DELIMITER_PRESET_SIGNS: Record<Exclude<DelimiterPreset, 'custom'>, string> = {
  paragraph: '\\n\\n',
  sentence: '.',
  newline: '\\n',
  heading: '#',
  question: '?',
  exclaim: '!',
  semicolon: ';',
};

const DEFAULTS: Record<SplitSourceKind, { chunkSize: number; chunkOverlap: number }> = {
  document: { chunkSize: 800, chunkOverlap: 280 },
  web: { chunkSize: 900, chunkOverlap: 120 },
  text: { chunkSize: 1500, chunkOverlap: 200 },
  qa: { chunkSize: 2200, chunkOverlap: 80 },
};

const PRESETS = new Set<DelimiterPreset>(DELIMITER_PRESET_ORDER);

function uniquePresets(keys: DelimiterPreset[]): DelimiterPreset[] {
  const seen = new Set<DelimiterPreset>();
  const out: DelimiterPreset[] = [];
  for (const key of DELIMITER_PRESET_ORDER) {
    if (!keys.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function emptySplitConfig(kind: SplitSourceKind): SplitConfigForm {
  return {
    splitMode: 'native',
    ...DEFAULTS[kind],
    delimiterPreset: 'paragraph',
    delimiterPresets: ['paragraph'],
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

function asPreset(value: unknown): DelimiterPreset | null {
  const key = String(value ?? '').trim().toLowerCase();
  return PRESETS.has(key as DelimiterPreset) ? (key as DelimiterPreset) : null;
}

function asPresets(nested: Record<string, unknown>, fallback: DelimiterPreset): DelimiterPreset[] {
  const raw = nested.delimiter_presets ?? nested.delimiterPresets ?? nested.chunk_delimiter_presets;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const parsed = uniquePresets(
    list.map((item) => asPreset(item)).filter((key): key is DelimiterPreset => key != null),
  );
  if (parsed.length) return parsed;
  return [asPreset(nested.delimiter_preset ?? nested.delimiterPreset ?? fallback) ?? fallback];
}

export function parseSplitConfig(raw: unknown, kind: SplitSourceKind): SplitConfigForm {
  const defaults = emptySplitConfig(kind);
  const record = asRecord(raw);
  const nested = asRecord(record?.split_config) ?? asRecord(record?.splitConfig) ?? record;
  if (!nested) return defaults;
  const mode = String(nested.mode ?? nested.splitMode ?? 'native').trim().toLowerCase();
  if (mode !== 'custom') return defaults;
  const presets = asPresets(nested, defaults.delimiterPreset);
  return {
    splitMode: 'custom',
    chunkSize: asInt(nested.chunk_size ?? nested.chunkSize, defaults.chunkSize),
    chunkOverlap: asInt(nested.chunk_overlap ?? nested.chunkOverlap, defaults.chunkOverlap),
    delimiterPreset: presets[0],
    delimiterPresets: presets,
    delimiterCustom: String(nested.delimiter_custom ?? nested.delimiterCustom ?? ''),
    parentChild: asBool(nested.parent_child ?? nested.parentChild),
    tableContext: asTableContext(nested.table_context ?? nested.tableContext),
    excelAsHtml: asBool(nested.excel_as_html ?? nested.excelAsHtml),
  };
}

function selectedPresets(form: SplitConfigForm): DelimiterPreset[] {
  const keys = form.delimiterPresets?.length ? form.delimiterPresets : [form.delimiterPreset];
  const ordered = uniquePresets(keys);
  return ordered.length ? ordered : ['paragraph'];
}

export function toSplitConfigApi(
  form: SplitConfigForm,
  options?: { omitNative?: boolean },
): Record<string, unknown> | undefined {
  if (form.splitMode !== 'custom') {
    return options?.omitNative ? undefined : { mode: 'native' };
  }
  const presets = selectedPresets(form);
  const payload: Record<string, unknown> = {
    mode: 'custom',
    chunk_size: form.chunkSize,
    chunk_overlap: form.chunkOverlap,
    delimiter_preset: presets[0],
    delimiter_presets: presets,
    delimiter_custom: presets.includes('custom') ? form.delimiterCustom : null,
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
  const presets = selectedPresets(form);
  const payload: Record<string, string | number | boolean | null> = {
    split_mode: 'custom',
    chunk_size: form.chunkSize,
    chunk_overlap: form.chunkOverlap,
    chunk_delimiter_preset: presets[0],
    chunk_delimiter_presets: presets.join(','),
    chunk_delimiter_custom: presets.includes('custom') ? form.delimiterCustom : null,
  };
  if (form.parentChild) payload.parent_child = true;
  if (form.tableContext === 1 || form.tableContext === 2) payload.table_context = form.tableContext;
  if (form.excelAsHtml) payload.excel_as_html = true;
  return payload;
}
