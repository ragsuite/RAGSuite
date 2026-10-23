import type {
  ExtraProviderKind,
  ModelOption,
  ProviderCatalogEntry,
  ProviderKind,
} from '@/features/model-configuration/types/model-configuration.types';
import { EXTRA_PROVIDER_KINDS, PROVIDER_KINDS } from '@/features/model-configuration/types/model-configuration.types';
import { ensureModelOptionPresent } from '@/features/search-config/utils/model-settings-options';

export const NATIVE_MODEL_VALUE = '';

export type KindFilter = 'all' | ProviderKind;

export const KIND_FILTERS: KindFilter[] = ['all', ...PROVIDER_KINDS];

export function providerHasKind(entry: ProviderCatalogEntry, kind: ProviderKind): boolean {
  return (entry.kinds ?? []).includes(kind);
}

export function countProvidersByKind(providers: ProviderCatalogEntry[]): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = {
    all: providers.length,
    chat: 0,
    embedding: 0,
    asr: 0,
    rerank: 0,
    tts: 0,
    ocr: 0,
  };
  for (const entry of providers) {
    for (const kind of entry.kinds ?? []) {
      counts[kind] += 1;
    }
  }
  return counts;
}

function firstToken(value: string): string {
  return value.split(/[_\s.-]+/).find(Boolean) ?? '';
}

function providerNameMatches(entry: ProviderCatalogEntry, needle: string): boolean {
  const key = entry.key.trim().toLowerCase();
  const label = (entry.label ?? '').trim().toLowerCase();
  if (key === needle || label === needle) return true;
  if (key.startsWith(needle) || label.startsWith(needle)) return true;
  return firstToken(key).startsWith(needle) || firstToken(label).startsWith(needle);
}

function looksLikeModelQuery(needle: string): boolean {
  return /[0-9]/.test(needle) || /[-_./]/.test(needle);
}

function entryModels(entry: ProviderCatalogEntry): ModelOption[] {
  return [
    ...entry.chatModels,
    ...entry.embeddingModels,
    ...entry.asrModels,
    ...entry.ttsModels,
    ...entry.rerankModels,
    ...entry.ocrModels,
  ];
}

function modelMatchesQuery(entry: ProviderCatalogEntry, needle: string): boolean {
  return entryModels(entry).some((model) => {
    const id = model.key.trim().toLowerCase();
    const name = model.label.trim().toLowerCase();
    if (id === needle || name === needle) return true;
    if (id.startsWith(needle) || name.startsWith(needle)) return true;
    const tail = id.split('/').pop() ?? id;
    return tail === needle || tail.startsWith(needle);
  });
}

export function providerMatchesQuery(entry: ProviderCatalogEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (providerNameMatches(entry, needle)) return true;
  return looksLikeModelQuery(needle) && modelMatchesQuery(entry, needle);
}

export function visibleCatalogProviders(
  providers: ProviderCatalogEntry[],
  kindFilter: KindFilter,
  query: string,
): ProviderCatalogEntry[] {
  return providers.filter((entry) => {
    if (kindFilter !== 'all' && !providerHasKind(entry, kindFilter)) return false;
    return providerMatchesQuery(entry, query);
  });
}

export function extraModelsFor(entry: ProviderCatalogEntry, kind: ExtraProviderKind): ModelOption[] {
  if (kind === 'asr') return entry.asrModels;
  if (kind === 'tts') return entry.ttsModels;
  if (kind === 'rerank') return entry.rerankModels;
  return entry.ocrModels;
}

export function resolveExtraModelOptions(
  entry: ProviderCatalogEntry,
  kind: ExtraProviderKind,
  selected: string,
  nativeLabel: string,
): ModelOption[] {
  const options = extraModelsFor(entry, kind);
  return [{ key: NATIVE_MODEL_VALUE, label: nativeLabel }, ...ensureModelOptionPresent(options, selected)];
}

export function isExtraProviderKind(kind: string): kind is ExtraProviderKind {
  return (EXTRA_PROVIDER_KINDS as readonly string[]).includes(kind);
}
