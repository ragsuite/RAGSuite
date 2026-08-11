import type {
  SearchBoxBorderRadius,
  SearchBoxButtonType,
  SearchBoxFormType,
  SearchBoxLanguage,
  SearchBoxLoader,
  SearchBoxStyle,
} from '@/features/search-config/types/search-config.types';

export function toApiSearchLanguage(language: SearchBoxLanguage): string {
  if (language === 'en-us') return 'en';
  if (language === 'pt-br') return 'pt';
  if (language === 'zh-cn') return 'zh';
  return language;
}

export function fromApiSearchLanguage(language: string | null | undefined): SearchBoxLanguage {
  const value = (language ?? 'en').toLowerCase();
  if (value === 'en' || value === 'en-us') return 'en-us';
  if (value === 'pt' || value === 'pt-br') return 'pt-br';
  if (value === 'zh' || value === 'zh-cn') return 'zh-cn';
  const allowed: SearchBoxLanguage[] = ['en-gb', 'hi', 'es', 'fr', 'de', 'ar'];
  return allowed.includes(value as SearchBoxLanguage) ? (value as SearchBoxLanguage) : 'en-us';
}

export function toApiStyleOption(style: SearchBoxStyle): string {
  return style === 'customise' ? 'plugin' : 'default';
}

export function fromApiStyleOption(style: string | null | undefined): SearchBoxStyle {
  const value = (style ?? 'default').toLowerCase();
  return value === 'plugin' || value === 'customise' ? 'customise' : 'default';
}

export function toApiLoaderType(loader: SearchBoxLoader): string {
  return loader;
}

export function fromApiLoaderType(loader: string | null | undefined): SearchBoxLoader {
  return loader === 'typing' ? 'typing' : 'skeleton';
}

export function toApiBorderRadius(radius: SearchBoxBorderRadius): string {
  return radius;
}

export function fromApiBorderRadius(radius: string | null | undefined): SearchBoxBorderRadius {
  const allowed: SearchBoxBorderRadius[] = ['rounded', 'medium-rounded', 'semi-rounded', 'square'];
  return allowed.includes(radius as SearchBoxBorderRadius) ? (radius as SearchBoxBorderRadius) : 'semi-rounded';
}

export function toApiSearchFormType(formType: SearchBoxFormType): string {
  return formType === 'with-button' ? 'withBtn' : 'default';
}

export function fromApiSearchFormType(formType: string | null | undefined): SearchBoxFormType {
  const value = (formType ?? 'default').toLowerCase();
  return value === 'withbtn' || value === 'with-button' || value === 'with_btn' ? 'with-button' : 'default';
}

export function toApiButtonType(buttonType: SearchBoxButtonType): string {
  return buttonType === 'with-label' ? 'withLabel' : 'icon';
}

export function fromApiButtonType(buttonType: string | null | undefined): SearchBoxButtonType {
  const value = (buttonType ?? 'icon').toLowerCase();
  if (value === 'withlabel' || value === 'with-label' || value === 'search-icon-with-label') return 'with-label';
  if (value === 'search-icon') return 'search-icon';
  return value === 'icon' ? 'search-icon' : 'search-icon';
}

export function toApiNumberingStyle(style: string): string {
  if (style === 'square') return 'brackets';
  if (style === 'plain') return 'numbers';
  return style;
}

export function fromApiNumberingStyle(style: string | null | undefined): 'square' | 'parentheses' | 'periods' | 'plain' {
  const value = (style ?? 'brackets').toLowerCase();
  if (value === 'brackets' || value === 'square') return 'square';
  if (value === 'numbers' || value === 'plain') return 'plain';
  if (value === 'dots' || value === 'periods') return 'periods';
  if (value === 'parentheses') return 'parentheses';
  return 'square';
}

export function isMaskedApiKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes('...') && trimmed.length <= 16) return true;
  if (trimmed.includes('•') || trimmed.includes('*')) return true;
  return /^sk-[•*]+/i.test(trimmed);
}

/**
 * True when local state / API indicates a provider key is already stored.
 * Rejects short junk that is not a mask and not a real post-save key.
 */
export function isSavedApiKeyMarker(value: string | undefined | null): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return false;
  if (isMaskedApiKey(trimmed) || trimmed.includes('*') || trimmed.includes('•')) return true;
  // Post-save marker may briefly keep the real key (Search/Chatbot save paths).
  if (trimmed.length >= 20 && /^[a-zA-Z0-9\-_.]+$/.test(trimmed)) return true;
  return false;
}

/** Stable UI marker after a successful save when the API omits api_key_masked. */
export function toApiKeyPresenceMarker(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return '';
  if (isMaskedApiKey(trimmed) || trimmed.includes('*') || trimmed.includes('•')) return trimmed;
  const prefix = trimmed.slice(0, Math.min(4, trimmed.length));
  return `${prefix}${'•'.repeat(10)}`;
}

/**
 * Resolve whether a saved key exists from API fields without treating
 * arbitrary short plaintext as “key saved”.
 */
export function resolveApiKeyMaskedPresence(input: {
  apiKeyMasked?: string | null;
  apiKey?: string | null;
  current?: string | null;
}): string {
  const explicit = input.apiKeyMasked?.trim() ?? '';
  if (explicit) {
    return isSavedApiKeyMarker(explicit) ? explicit : '';
  }

  const raw = input.apiKey?.trim() ?? '';
  if (raw && (isMaskedApiKey(raw) || raw.includes('*') || raw.includes('•'))) {
    return raw;
  }

  const current = input.current?.trim() ?? '';
  return isSavedApiKeyMarker(current) ? current : '';
}

export function validateSearchApiKeyForSave(apiKey: string, hasSavedKey: boolean): string | null {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return hasSavedKey ? null : 'API key is required for this provider.';
  }
  if (isMaskedApiKey(trimmed)) return null;
  if (trimmed.length < 20) return 'API key must be at least 20 characters.';
  if (!/^[a-zA-Z0-9\-_.]+$/.test(trimmed)) {
    return 'API key contains invalid characters.';
  }
  return null;
}
