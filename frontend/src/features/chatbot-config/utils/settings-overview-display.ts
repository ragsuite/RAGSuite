export function settingsOverviewProviderLabel(provider: string): string {
  const trimmed = provider.trim();
  if (!trimmed) return 'Not set';
  if (trimmed.toLowerCase() === 'ollama') return 'Ollama';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function settingsOverviewLanguageCode(language: string): string {
  const trimmed = language.trim();
  if (!trimmed) return '—';
  return trimmed.toUpperCase();
}

export function settingsOverviewWidgetPositionLabel(position: string): string {
  const normalized = position.trim().replace(/-/g, ' ');
  if (!normalized) return 'Not set';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function settingsOverviewApiKeyPreview(masked: string): string | null {
  const trimmed = masked.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 8)}...`;
}
