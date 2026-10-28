import { getTimezonesForCountry } from 'countries-and-timezones';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

export type CountryOption = {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
};

export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return [...code.toUpperCase()]
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}

export function listCountries(locale = 'en'): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return getCountries()
    .map((code) => ({
      code,
      name: names.of(code) || code,
      dialCode: `+${getCountryCallingCode(code)}`,
      flag: flagEmoji(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function dialCodeForCountry(code: string): string {
  try {
    return `+${getCountryCallingCode(code as CountryCode)}`;
  } catch {
    return '';
  }
}

export function timezonesForCountry(code: string): string[] {
  if (!code) return [];
  const zones = getTimezonesForCountry(code) ?? [];
  return zones.map((zone) => zone.name);
}

export function defaultTimezoneForCountry(code: string): string {
  const zones = timezonesForCountry(code);
  return zones.length === 1 ? zones[0] : '';
}

export function isSingleTimezoneCountry(code: string): boolean {
  return timezonesForCountry(code).length === 1;
}

export function matchesCountryQuery(option: CountryOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    option.name.toLowerCase().includes(needle) ||
    option.code.toLowerCase().includes(needle) ||
    option.dialCode.includes(needle.replace(/\s/g, ''))
  );
}
