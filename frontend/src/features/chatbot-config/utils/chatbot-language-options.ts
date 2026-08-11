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
