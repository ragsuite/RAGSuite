import {
  getExampleNumber,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';

export function nationalNumberFromStored(phone: string, country?: string): string {
  const raw = phone.trim();
  if (!raw) return '';
  const parsed = parsePhoneNumberFromString(raw, country ? (country as CountryCode) : undefined);
  if (parsed) return String(parsed.nationalNumber);
  return raw.replace(/^\+\d{1,4}/, '');
}

export function toE164(national: string, country: string): string | null {
  const raw = national.trim();
  if (!raw || !country) return null;
  const parsed = parsePhoneNumberFromString(raw, country as CountryCode);
  if (!parsed?.isValid()) return null;
  return parsed.number;
}

export function isOptionalPhoneValid(national: string, country: string): boolean {
  const raw = national.trim();
  if (!raw) return true;
  if (!country) return false;
  return isValidPhoneNumber(raw, country as CountryCode);
}

export function nationalMaxLength(country: string): number {
  if (!country) return 15;
  try {
    const example = getExampleNumber(country as CountryCode, examples);
    const length = example ? String(example.nationalNumber).length : 0;
    if (length > 0) return length;
  } catch {
    // Fall through to a conservative national cap.
  }
  return 15;
}

export function clampNationalNumber(national: string, country: string): string {
  const digits = national.replace(/[^\d]/g, '');
  if (!country) return digits;
  return digits.slice(0, nationalMaxLength(country));
}

/** Live error only when the national number is already as long as the country allows and still invalid. */
export function livePhoneInvalid(national: string, country: string): boolean {
  const raw = national.trim();
  if (!raw || !country) return false;
  if (raw.length < nationalMaxLength(country)) return false;
  return !isValidPhoneNumber(raw, country as CountryCode);
}
