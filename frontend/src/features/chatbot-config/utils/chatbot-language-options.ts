export const CHATBOT_LANGUAGE_OPTIONS = [
  { key: 'en', label: 'English (US)' },
  { key: 'en-gb', label: 'English (UK)' },
  { key: 'hi', label: 'Hindi' },
  { key: 'es', label: 'Spanish' },
  { key: 'fr', label: 'French' },
  { key: 'de', label: 'German' },
  { key: 'ar', label: 'Arabic' },
  { key: 'pt', label: 'Portuguese' },
  { key: 'zh', label: 'Chinese' },
] as const;

export function chatbotLanguageLabel(code: string): string {
  return CHATBOT_LANGUAGE_OPTIONS.find((option) => option.key === code)?.label ?? code;
}

/** Display-only country flags for the existing language keys. Not a language list. */
const CHATBOT_LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇺🇸',
  'en-gb': '🇬🇧',
  hi: '🇮🇳',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  ar: '🇸🇦',
  pt: '🇵🇹',
  zh: '🇨🇳',
};

export function chatbotLanguageFlag(code: string): string {
  return CHATBOT_LANGUAGE_FLAGS[code] ?? '🌐';
}
