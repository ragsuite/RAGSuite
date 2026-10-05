/** Curated BCP-47 locales for Voice Pilot speech recognition (Setup dropdown). */

export type SttLocaleOption = {
  key: string;
  label: string;
};

/**
 * Seeded from unique BCP-47 targets used by `toSpeechLocale` in web-speech.ts,
 * plus a few common extras (es-MX, uk-UA, sv-SE, uz-UZ). Not coupled to that map.
 */
export const STT_LOCALE_OPTIONS: SttLocaleOption[] = [
  { key: 'en-US', label: 'English (United States) — en-US' },
  { key: 'en-GB', label: 'English (United Kingdom) — en-GB' },
  { key: 'en-AU', label: 'English (Australia) — en-AU' },
  { key: 'en-CA', label: 'English (Canada) — en-CA' },
  { key: 'en-IN', label: 'English (India) — en-IN' },
  { key: 'de-DE', label: 'German (Germany) — de-DE' },
  { key: 'fr-FR', label: 'French (France) — fr-FR' },
  { key: 'es-ES', label: 'Spanish (Spain) — es-ES' },
  { key: 'es-MX', label: 'Spanish (Mexico) — es-MX' },
  { key: 'pt-PT', label: 'Portuguese (Portugal) — pt-PT' },
  { key: 'pt-BR', label: 'Portuguese (Brazil) — pt-BR' },
  { key: 'zh-CN', label: 'Chinese (Simplified, China) — zh-CN' },
  { key: 'zh-TW', label: 'Chinese (Traditional, Taiwan) — zh-TW' },
  { key: 'zh-HK', label: 'Chinese (Hong Kong) — zh-HK' },
  { key: 'ar-SA', label: 'Arabic (Saudi Arabia) — ar-SA' },
  { key: 'it-IT', label: 'Italian (Italy) — it-IT' },
  { key: 'nl-NL', label: 'Dutch (Netherlands) — nl-NL' },
  { key: 'ja-JP', label: 'Japanese (Japan) — ja-JP' },
  { key: 'ko-KR', label: 'Korean (Korea) — ko-KR' },
  { key: 'bn-IN', label: 'Bengali (India) — bn-IN' },
  { key: 'gu-IN', label: 'Gujarati (India) — gu-IN' },
  { key: 'mr-IN', label: 'Marathi (India) — mr-IN' },
  { key: 'ta-IN', label: 'Tamil (India) — ta-IN' },
  { key: 'te-IN', label: 'Telugu (India) — te-IN' },
  { key: 'kn-IN', label: 'Kannada (India) — kn-IN' },
  { key: 'ml-IN', label: 'Malayalam (India) — ml-IN' },
  { key: 'pa-IN', label: 'Punjabi (India) — pa-IN' },
  { key: 'ur-IN', label: 'Urdu (India) — ur-IN' },
  { key: 'tr-TR', label: 'Turkish (Turkey) — tr-TR' },
  { key: 'pl-PL', label: 'Polish (Poland) — pl-PL' },
  { key: 'ru-RU', label: 'Russian (Russia) — ru-RU' },
  { key: 'vi-VN', label: 'Vietnamese (Vietnam) — vi-VN' },
  { key: 'id-ID', label: 'Indonesian (Indonesia) — id-ID' },
  { key: 'ms-MY', label: 'Malay (Malaysia) — ms-MY' },
  { key: 'th-TH', label: 'Thai (Thailand) — th-TH' },
  { key: 'he-IL', label: 'Hebrew (Israel) — he-IL' },
  { key: 'uk-UA', label: 'Ukrainian (Ukraine) — uk-UA' },
  { key: 'sv-SE', label: 'Swedish (Sweden) — sv-SE' },
  { key: 'uz-UZ', label: 'Uzbek (Uzbekistan) — uz-UZ' },
];

/** Options for AppSelectField; appends a legacy free-text value if not in the curated list. */
export function sttLocaleSelectOptions(currentValue: string): SttLocaleOption[] {
  const trimmed = currentValue.trim();
  if (!trimmed) return STT_LOCALE_OPTIONS;
  const known = STT_LOCALE_OPTIONS.some((opt) => opt.key === trimmed);
  if (known) return STT_LOCALE_OPTIONS;
  return [{ key: trimmed, label: trimmed }, ...STT_LOCALE_OPTIONS];
}
