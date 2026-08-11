const OTP_DIGIT_PATTERN = /\D/g;

export function sanitizeOtpDigits(value: string, maxLength = 6): string {
  return value.replace(OTP_DIGIT_PATTERN, '').slice(0, maxLength);
}
