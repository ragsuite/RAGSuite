import type { SearchHistoryEntry } from '@/features/search-config/types/search-config.types';

export type SearchHistorySource = {
  title: string;
  url: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getSearchHistoryCreatedAt(item: SearchHistoryEntry): string {
  return item.created_at ?? item.createdAt ?? new Date().toISOString();
}

/** Oldest search first — matches web detail thread order. */
export function sortSearchHistoryMessages(messages: SearchHistoryEntry[]): SearchHistoryEntry[] {
  return [...messages].sort(
    (a, b) => new Date(getSearchHistoryCreatedAt(a)).getTime() - new Date(getSearchHistoryCreatedAt(b)).getTime(),
  );
}

export function parseSearchHistorySources(raw: unknown): SearchHistorySource[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const title = asString(row.title) ?? asString(row.name) ?? asString(row.source_file) ?? '';
      const url = asString(row.url) ?? asString(row.link) ?? asString(row.source_url) ?? '';
      if (!title.trim() && !url.trim()) return null;
      return {
        title: title.trim() || 'Source',
        url: url.trim(),
      };
    })
    .filter((source): source is SearchHistorySource => source != null);
}

export function resolveSearchHistoryTopK(entry: SearchHistoryEntry, fallbackTopK?: number): number {
  const snapshot = asRecord(entry.execution_snapshot);
  const fromSnapshot = asNumber(snapshot?.top_k) ?? asNumber(snapshot?.topK);
  if (fromSnapshot != null) return fromSnapshot;
  if (fallbackTopK != null) return fallbackTopK;
  const sourceCount = parseSearchHistorySources(entry.sources).length;
  return sourceCount > 0 ? sourceCount : 1;
}

export function formatSearchHistoryListDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatSearchHistoryMessageDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Copy shown when the project has no saved search sessions yet. */
export function getSearchHistoryEmptyCopy(t: (key: string) => string) {
  return {
    title: t('search.history.emptyState.title'),
    body: t('search.history.emptyState.body'),
    action: t('search.history.emptyState.action'),
  };
}

/** Copy when sessions exist but none match the current filters. */
export function getSearchHistoryFilterEmptyCopy(t: (key: string) => string) {
  return {
    title: t('search.history.filterEmpty.title'),
    body: t('search.history.filterEmpty.body'),
  };
}

/** Copy when the list has sessions but none is selected (desktop detail pane). */
export function getSearchHistorySelectSessionCopy(t: (key: string) => string) {
  return {
    title: t('search.history.selectSession.title'),
    body: t('search.history.selectSession.body'),
  };
}

export function getSearchHistorySessionNotFoundCopy(t: (key: string) => string) {
  return {
    title: t('search.history.sessionNotFound.title'),
    body: t('search.history.sessionNotFound.body'),
  };
}
