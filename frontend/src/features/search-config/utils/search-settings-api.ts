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
 *
 * Never falls back to ``current`` — that leaked Project A's mask into Project B
 * when B had no key. Callers must pass the fresh API ``api_key`` / mask only.
 */
export function resolveApiKeyMaskedPresence(input: {
  apiKeyMasked?: string | null;
  apiKey?: string | null;
  /** @deprecated Ignored — kept for call-site compatibility. */
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

  return '';
}

/**
 * Convert backend ``abcd...wxyz`` mask into a professional field display
 * ``abcd********wxyz`` (visible prefix/suffix, starred middle).
 */
export function formatApiKeyFieldDisplay(masked: string | null | undefined): string {
  const trimmed = masked?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.includes('...')) {
    const [prefix, suffix] = trimmed.split('...');
    if (prefix && suffix) {
      return `${prefix}${'*'.repeat(8)}${suffix}`;
    }
  }
  if (trimmed.includes('•')) {
    return trimmed.replace(/•/g, '*');
  }
  // Never echo a full provider secret in the settings field.
  if (trimmed.length >= 20 && /^[a-zA-Z0-9\-_.]+$/.test(trimmed)) {
    return toApiKeyPresenceMarker(trimmed).replace(/•/g, '*');
  }
  return trimmed;
}

export function resolveSavedApiKeyMask(args: {
  providerApiKeys?: Record<string, string> | null;
  provider: string | null | undefined;
  apiKeyMasked?: string | null;
}): string {
  return (
    lookupProviderApiKeyMask(args.providerApiKeys, args.provider) ||
    args.apiKeyMasked?.trim() ||
    ''
  );
}

export function buildSavedApiKeyFieldDisplay(args: {
  providerApiKeys?: Record<string, string> | null;
  provider: string | null | undefined;
  apiKeyMasked?: string | null;
}): string {
  const mask = resolveSavedApiKeyMask(args);
  return mask ? formatApiKeyFieldDisplay(mask) : '';
}

/** Field value when idle: show mask for saved keys, never leave plaintext visible. */
export function resolveApiKeyFieldValue(args: {
  draftApiKey: string;
  providerApiKeys?: Record<string, string> | null;
  provider: string | null | undefined;
  apiKeyMasked?: string | null;
  hasSavedApiKey: boolean;
  isEditing: boolean;
  isOllama: boolean;
}): string {
  if (args.isOllama) return args.draftApiKey;
  if (args.isEditing) return args.draftApiKey;
  if (args.hasSavedApiKey) {
    const masked = buildSavedApiKeyFieldDisplay({
      providerApiKeys: args.providerApiKeys,
      provider: args.provider,
      apiKeyMasked: args.apiKeyMasked,
    });
    if (masked) return masked;
  }
  const trimmed = args.draftApiKey.trim();
  if (trimmed && isMaskedApiKey(trimmed)) return trimmed;
  if (trimmed.length >= 20 && /^[a-zA-Z0-9\-_.]+$/.test(trimmed)) {
    return formatApiKeyFieldDisplay(trimmed);
  }
  return args.draftApiKey;
}

/** Normalize provider family key used in ``provider_api_keys`` maps. */
export function normalizeProviderApiKeyFamily(provider: string | null | undefined): string {
  const key = (provider || '').toLowerCase().replace(/\s+/g, '-');
  if (!key) return '';
  if (key.includes('google') || key.includes('gemini')) return 'gemini';
  if (key.includes('mistral')) return 'mistral';
  if (key.includes('anthropic') || key.includes('claude')) return 'anthropic';
  if (key.includes('openai')) return 'openai';
  if (key.includes('ollama') || key.includes('custom')) return 'ollama';
  return key;
}

/** Look up a masked key for a provider from the server ``provider_api_keys`` map. */
export function lookupProviderApiKeyMask(
  providerApiKeys: Record<string, string> | null | undefined,
  provider: string | null | undefined,
): string {
  if (!providerApiKeys) return '';
  const family = normalizeProviderApiKeyFamily(provider);
  if (!family || family === 'ollama') return '';
  const direct = providerApiKeys[family]?.trim();
  if (direct) return direct;
  // Tolerate alias keys from older clients
  for (const [key, value] of Object.entries(providerApiKeys)) {
    if (normalizeProviderApiKeyFamily(key) === family && value?.trim()) {
      return value.trim();
    }
  }
  return '';
}

export function parseProviderApiKeysMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) {
      const family = normalizeProviderApiKeyFamily(key);
      if (family && family !== 'ollama') {
        out[family] = value.trim();
      }
    }
  }
  return out;
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
