import type {
  CitationFormat,
  SearchBoxButtonType,
  SearchBoxConfig,
  SearchBoxCustomization,
  SearchBoxLanguage,
  SearchBoxStyle,
} from '@/features/search-config/types/search-config.types';
import { formatModelProviderLabel } from '@/features/search-config/utils/model-settings-options';
import { OLLAMA_PLACEHOLDER_API_KEY, isOllamaProvider } from '@/features/search-config/utils/search-model-settings';
import type { ModelSettings } from '@/features/search-config/types/search-config.types';

export function settingsOverviewProviderLabel(provider: string | undefined): string {
  if (!provider?.trim()) return 'Not set';
  return formatModelProviderLabel(provider);
}

export function settingsOverviewApiKeyPreview(masked: string | undefined): string | null {
  const value = masked?.trim();
  if (!value) return null;
  return `${value.substring(0, 8)}...`;
}

export function settingsOverviewApiKeyFromModel(settings: ModelSettings | undefined): string | null {
  const masked = settings?.apiKeyMasked?.trim();
  if (masked) return settingsOverviewApiKeyPreview(masked);
  if (isOllamaProvider(settings?.provider)) {
    return settingsOverviewApiKeyPreview(OLLAMA_PLACEHOLDER_API_KEY);
  }
  return null;
}

export function settingsOverviewCitationStyleLabel(style: CitationFormat['citationStyle'] | undefined): string {
  if (!style) return 'Detailed';
  return style.charAt(0).toUpperCase() + style.slice(1);
}

export function settingsOverviewCitationLayoutLabel(layout: CitationFormat['layout'] | undefined): string {
  if (!layout) return 'Vertical';
  return layout.charAt(0).toUpperCase() + layout.slice(1);
}

/** Reference overview shows raw numbering key capitalized (e.g. dots → Dots). */
export function settingsOverviewCitationNumberingLabel(
  numbering: CitationFormat['numberingStyle'] | undefined,
): string {
  const map: Record<CitationFormat['numberingStyle'], string> = {
    square: 'Brackets',
    parentheses: 'Parentheses',
    periods: 'Dots',
    plain: 'Numbers',
  };
  return numbering ? map[numbering] : 'Brackets';
}

/** Reference overview uses short uppercase language (EN) from API code. */
export function settingsOverviewLanguageLabel(language: SearchBoxLanguage | undefined): string {
  if (!language) return 'Not set';
  if (language === 'en-us' || language === 'en-gb') return 'EN';
  if (language === 'pt-br') return 'PT';
  if (language === 'zh-cn') return 'ZH';
  return language.toUpperCase();
}

/** Reference maps plugin/customise style to “Plugin”. */
export function settingsOverviewStyleLabel(style: SearchBoxStyle | undefined): string {
  if (!style) return 'Not set';
  return style === 'customise' ? 'Plugin' : 'Default';
}

export function settingsOverviewIconLabel(icon: SearchBoxConfig['searchIcon'] | undefined): string {
  if (!icon) return 'Not set';
  return icon.charAt(0).toUpperCase() + icon.slice(1);
}

export function settingsOverviewFormTypeLabel(formType: SearchBoxCustomization['searchFormType'] | undefined): string {
  if (formType === 'with-button') return 'With Button';
  return 'Default';
}

export function settingsOverviewButtonTypeLabel(buttonType: SearchBoxButtonType | undefined): string {
  if (buttonType === 'with-label') return 'With Label';
  return 'Icon Only';
}
