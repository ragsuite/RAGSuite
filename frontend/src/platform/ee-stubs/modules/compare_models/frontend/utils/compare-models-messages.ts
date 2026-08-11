type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function getEmptyProfilesMessage(
  t: TranslateFn,
  configuredSource: string,
  hasProject: boolean,
): string {
  if (!hasProject) return t('compareModels.empty.noProject');
  if (configuredSource === 'both') return t('compareModels.empty.both');
  if (configuredSource === 'chat') return t('compareModels.empty.chat');
  if (configuredSource === 'auto') return t('compareModels.empty.auto');
  return t('compareModels.empty.search');
}

export function mapCompareStreamError(error: string | null | undefined): string {
  if (!error?.trim()) return 'Model comparison failed.';
  const trimmed = error.trim();
  if (trimmed.toLowerCase().includes('api key')) return 'Invalid or missing API key for this model.';
  if (trimmed.toLowerCase().includes('timeout')) return 'The model request timed out. Try again.';
  return trimmed;
}

export function isReadOnlyCompareProfile(id: string, isRuntimeConfig?: boolean): boolean {
  return Boolean(isRuntimeConfig) || id.startsWith('chat:') || id.startsWith('search:');
}

export function isReadOnlyCompareProfileDelete(id: string, isRuntimeConfig?: boolean): boolean {
  return Boolean(isRuntimeConfig) || id.startsWith('chat:');
}
