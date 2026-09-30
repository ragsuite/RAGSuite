/** Keep only digit characters (silent strip for retention/session fields). */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '');
}
