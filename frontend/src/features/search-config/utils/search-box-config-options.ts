import type {
  SearchBoxBorderRadius,
  SearchBoxIcon,
  SearchBoxLanguage,
  SearchBoxLoader,
  SearchBoxStyle,
} from '@/features/search-config/types/search-config.types';

export const SEARCH_BOX_LANGUAGE_OPTIONS: { key: SearchBoxLanguage; label: string }[] = [
  { key: 'en-us', label: 'English (US)' },
  { key: 'en-gb', label: 'English (UK)' },
  { key: 'hi', label: 'Hindi' },
  { key: 'es', label: 'Spanish' },
  { key: 'fr', label: 'French' },
  { key: 'de', label: 'German' },
  { key: 'ar', label: 'Arabic' },
  { key: 'pt-br', label: 'Portuguese (Brazil)' },
  { key: 'zh-cn', label: 'Chinese (Simplified)' },
];

export const SEARCH_BOX_STYLE_OPTIONS: { key: SearchBoxStyle; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'customise', label: 'Customise Style' },
];

export const SEARCH_BOX_ICON_OPTIONS: { key: SearchBoxIcon; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'scan', label: 'Scan' },
  { key: 'sparkles', label: 'Sparkles' },
];

export const SEARCH_BOX_LOADER_OPTIONS: { key: SearchBoxLoader; label: string }[] = [
  { key: 'skeleton', label: 'Skeleton' },
  { key: 'typing', label: 'Typing Loader' },
];

export const SEARCH_BOX_BORDER_RADIUS_OPTIONS: { key: SearchBoxBorderRadius; label: string }[] = [
  { key: 'rounded', label: 'Rounded' },
  { key: 'medium-rounded', label: 'Medium Rounded' },
  { key: 'semi-rounded', label: 'Semi Rounded' },
  { key: 'square', label: 'Square' },
];

export const SEARCH_BOX_BORDER_RADIUS_PX: Record<SearchBoxBorderRadius, number> = {
  rounded: 12,
  'medium-rounded': 10,
  'semi-rounded': 8,
  square: 0,
};

export function searchBoxStyleLabel(style: SearchBoxStyle): string {
  return SEARCH_BOX_STYLE_OPTIONS.find((o) => o.key === style)?.label ?? style;
}

export function searchBoxIconLabel(icon: SearchBoxIcon): string {
  return SEARCH_BOX_ICON_OPTIONS.find((o) => o.key === icon)?.label ?? icon;
}

export function searchBoxLanguageLabel(language: SearchBoxLanguage): string {
  return SEARCH_BOX_LANGUAGE_OPTIONS.find((o) => o.key === language)?.label ?? language;
}

export const SEARCH_BOX_RECENT_SEARCH_PREVIEW = [
  'What is RAG?',
  'How to configure chatbot?',
  'API documentation',
] as const;
