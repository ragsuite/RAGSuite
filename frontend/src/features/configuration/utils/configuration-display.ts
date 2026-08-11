import type { ApiKey, ApiKeyEnvironment } from '@/features/configuration/types/configuration.types';

const ENVIRONMENT_LABELS: Record<ApiKeyEnvironment, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
};

export function formatApiKeyEnvironment(environment: ApiKeyEnvironment): string {
  return ENVIRONMENT_LABELS[environment];
}

export function formatApiKeyDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

export function formatApiKeyLastUsed(iso: string | null): string {
  if (!iso) return '—';
  return formatApiKeyDate(iso);
}

export function formatApiKeyDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRequestCount(count: number): string {
  return count.toLocaleString();
}

export function formatApiKeySelectLabel(key: ApiKey): string {
  return `${key.name} · ${formatApiKeyEnvironment(key.environment)} (${key.maskedKey})`;
}

export function getDisplayKey(key: ApiKey, revealed: boolean, revealedSecret?: string | null): string {
  if (revealed) {
    return revealedSecret ?? key.secretKey ?? key.maskedKey;
  }
  return key.maskedKey;
}

export function canRevealKey(_key: ApiKey): boolean {
  return true;
}

export function canCopyFullKey(key: ApiKey, revealed: boolean, revealedSecret?: string | null): boolean {
  return revealed && Boolean(revealedSecret ?? key.secretKey);
}
