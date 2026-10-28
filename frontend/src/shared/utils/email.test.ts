import { isValidEmailAddress, liveEmailInvalid } from '@/shared/utils/email';

describe('email helpers', () => {
  it('accepts a standard address', () => {
    expect(isValidEmailAddress('you@example.com')).toBe(true);
    expect(liveEmailInvalid('you@example.com')).toBe(false);
  });

  it('does not live-invalidate an empty field', () => {
    expect(liveEmailInvalid('')).toBe(false);
    expect(liveEmailInvalid('   ')).toBe(false);
  });

  it('live-invalidates incomplete or malformed addresses', () => {
    expect(liveEmailInvalid('you')).toBe(true);
    expect(liveEmailInvalid('you@')).toBe(true);
    expect(liveEmailInvalid('you@example')).toBe(true);
    expect(isValidEmailAddress('you@example')).toBe(false);
  });
});
