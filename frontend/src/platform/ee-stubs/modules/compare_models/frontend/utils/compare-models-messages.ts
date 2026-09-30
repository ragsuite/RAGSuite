type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const PROVIDER_PROFILE_PREFIX = 'provider:';

export function getEmptyProfilesMessage(
  t: TranslateFn,
  configuredSource: string,
  hasProject: boolean,
): string {
  if (!hasProject) return t('compareModels.empty.noProject');
  if (configuredSource === 'providers') return t('compareModels.empty.providers');
  if (configuredSource === 'both') return t('compareModels.empty.both');
  if (configuredSource === 'chat') return t('compareModels.empty.chat');
  if (configuredSource === 'auto') return t('compareModels.empty.auto');
  return t('compareModels.empty.search');
}

/** User-facing caption for which model configs power compare (no env var names). */
export function getConfiguredSourceCaption(
  t: TranslateFn,
  configuredSource: string | null | undefined,
): string | null {
  if (!configuredSource) return null;
  if (configuredSource === 'providers') return t('compareModels.source.providers');
  if (configuredSource === 'chat') return t('compareModels.source.chat');
  if (configuredSource === 'search') return t('compareModels.source.search');
  if (configuredSource === 'both') return t('compareModels.source.both');
  if (configuredSource === 'auto') return t('compareModels.source.auto');
  return null;
}


export function mapCompareStreamError(error: string | null | undefined): string {
  if (!error?.trim()) return 'Model comparison failed.';
  const trimmed = error.trim();
  if (trimmed.toLowerCase().includes('api key')) return 'Invalid or missing API key for this model.';
  if (trimmed.toLowerCase().includes('timeout')) return 'The model request timed out. Try again.';
  return trimmed;
}

/** Model Configuration providers: toggled per compare session only, never persisted. */
export function isSessionToggleCompareProfile(id: string): boolean {
  return id.startsWith(PROVIDER_PROFILE_PREFIX);
}

export function isReadOnlyCompareProfile(id: string, isRuntimeConfig?: boolean): boolean {
  return (
    Boolean(isRuntimeConfig) ||
    id.startsWith('chat:') ||
    id.startsWith('search:') ||
    isSessionToggleCompareProfile(id)
  );
}

export function isReadOnlyCompareProfileDelete(id: string, isRuntimeConfig?: boolean): boolean {
  return Boolean(isRuntimeConfig) || id.startsWith('chat:') || isSessionToggleCompareProfile(id);
}

/** Whether the compare sheet switch is interactive for this row. */
export function canToggleCompareProfile(id: string, isRuntimeConfig?: boolean): boolean {
  return isSessionToggleCompareProfile(id) || !isReadOnlyCompareProfile(id, isRuntimeConfig);
}
