const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Live error only after the user has typed something that is not a valid email. */
export function liveEmailInvalid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !isValidEmailAddress(trimmed);
}
