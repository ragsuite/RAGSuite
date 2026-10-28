import {
  clampNationalNumber,
  isOptionalPhoneValid,
  livePhoneInvalid,
  nationalMaxLength,
  nationalNumberFromStored,
  toE164,
} from '@/shared/geo/phone';

describe('phone helpers', () => {
  it('accepts a 10-digit Indian national number', () => {
    expect(isOptionalPhoneValid('9876543210', 'IN')).toBe(true);
    expect(toE164('9876543210', 'IN')).toBe('+919876543210');
  });

  it('rejects an invalid national number', () => {
    expect(isOptionalPhoneValid('123', 'IN')).toBe(false);
    expect(toE164('123', 'IN')).toBeNull();
  });

  it('requires a country before a number is valid', () => {
    expect(isOptionalPhoneValid('9876543210', '')).toBe(false);
  });

  it('allows an empty number', () => {
    expect(isOptionalPhoneValid('', 'IN')).toBe(true);
    expect(isOptionalPhoneValid('', '')).toBe(true);
  });

  it('invalidates a number after the country changes', () => {
    expect(isOptionalPhoneValid('9876543210', 'US')).toBe(false);
    expect(nationalNumberFromStored('+919876543210', 'IN')).toBe('9876543210');
  });

  it('uses country metadata for national max length', () => {
    expect(nationalMaxLength('IN')).toBe(10);
    expect(nationalMaxLength('DE')).toBe(11);
    expect(clampNationalNumber('98765432101234', 'IN')).toBe('9876543210');
    expect(clampNationalNumber('151234567890', 'DE')).toBe('15123456789');
  });

  it('only live-invalidates when the number has reached the country max', () => {
    expect(livePhoneInvalid('98765', 'IN')).toBe(false);
    expect(livePhoneInvalid('9876543210', 'IN')).toBe(false);
    expect(livePhoneInvalid('0000000000', 'IN')).toBe(true);
  });
});
