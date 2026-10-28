/** Dashboard active project for requests that are not embed-scoped. */

let networkActiveProjectId: string | null = null;
const listeners = new Set<() => void>();

function normalizeProjectId(next: string | null | undefined): string | null {
  const value = typeof next === 'string' ? next.trim() : '';
  return value || null;
}

export function getNetworkActiveProjectId(): string | null {
  return networkActiveProjectId;
}

export function setNetworkActiveProjectId(next: string | null | undefined): void {
  const normalized = normalizeProjectId(next);
  if (normalized === networkActiveProjectId) return;
  networkActiveProjectId = normalized;
  for (const listener of listeners) listener();
}

export function subscribeNetworkActiveProjectId(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
