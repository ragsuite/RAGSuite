import {
  clampSessionTimeoutMinutes,
  formatSessionCountdown,
  parseExpiresAtMs,
  remainingMsUntil,
  SESSION_TIMEOUT_COUNTDOWN_HORIZON_MS,
  SESSION_TIMEOUT_MAX_MINUTES,
  SESSION_TIMEOUT_MIN_MINUTES,
  shouldShowSessionCountdown,
} from '@/features/auth/utils/session-countdown';

describe('clampSessionTimeoutMinutes', () => {
  it('clamps below minimum', () => {
    expect(clampSessionTimeoutMinutes(1)).toBe(SESSION_TIMEOUT_MIN_MINUTES);
  });

  it('clamps above maximum', () => {
    expect(clampSessionTimeoutMinutes(10_000)).toBe(SESSION_TIMEOUT_MAX_MINUTES);
  });

  it('passes through valid values', () => {
    expect(clampSessionTimeoutMinutes(20)).toBe(20);
    expect(clampSessionTimeoutMinutes(1440)).toBe(1440);
  });
});

describe('shouldShowSessionCountdown', () => {
  it('hides far-future remaining time', () => {
    expect(shouldShowSessionCountdown(null)).toBe(false);
    expect(shouldShowSessionCountdown(SESSION_TIMEOUT_COUNTDOWN_HORIZON_MS + 1)).toBe(false);
  });

  it('shows practical remaining time', () => {
    expect(shouldShowSessionCountdown(SESSION_TIMEOUT_COUNTDOWN_HORIZON_MS)).toBe(true);
    expect(shouldShowSessionCountdown(60_000)).toBe(true);
    expect(shouldShowSessionCountdown(0)).toBe(true);
  });
});

describe('formatSessionCountdown', () => {
  it('formats under one hour as mm:ss', () => {
    expect(formatSessionCountdown(65_000)).toBe('01:05');
    expect(formatSessionCountdown(0)).toBe('00:00');
  });

  it('formats one hour or more as h:mm:ss', () => {
    expect(formatSessionCountdown(3_661_000)).toBe('1:01:01');
  });
});

describe('parseExpiresAtMs', () => {
  it('treats naive ISO as UTC', () => {
    expect(parseExpiresAtMs('2026-01-01T00:01:00')).toBe(Date.parse('2026-01-01T00:01:00.000Z'));
    expect(parseExpiresAtMs('2026-01-01T00:01:00.123')).toBe(Date.parse('2026-01-01T00:01:00.123Z'));
  });

  it('keeps explicit Z and offsets', () => {
    expect(parseExpiresAtMs('2026-01-01T00:01:00Z')).toBe(Date.parse('2026-01-01T00:01:00.000Z'));
    expect(parseExpiresAtMs('2026-01-01T05:31:00+05:30')).toBe(Date.parse('2026-01-01T00:01:00.000Z'));
  });

  it('returns null for invalid input', () => {
    expect(parseExpiresAtMs('')).toBeNull();
    expect(parseExpiresAtMs('not-a-date')).toBeNull();
  });
});

describe('remainingMsUntil', () => {
  it('returns null for missing/invalid expiry', () => {
    expect(remainingMsUntil(null)).toBeNull();
    expect(remainingMsUntil('not-a-date')).toBeNull();
  });

  it('computes remaining against now for Z timestamps', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    expect(remainingMsUntil('2026-01-01T00:01:00.000Z', now)).toBe(60_000);
  });

  it('keeps naive UTC expiry positive for a 60-minute session', () => {
    const now = Date.parse('2026-01-01T10:00:00.000Z');
    expect(remainingMsUntil('2026-01-01T11:00:00', now)).toBe(3_600_000);
  });
});
