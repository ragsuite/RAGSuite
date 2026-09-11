/** Session timeout clamp + countdown formatting helpers. */

export const SESSION_TIMEOUT_MIN_MINUTES = 5;
export const SESSION_TIMEOUT_MAX_MINUTES = 1440;
export const SESSION_TIMEOUT_WARN_MS = 2 * 60 * 1000;
/** Hide countdown / auto-logout UX when remaining exceeds this (disabled absolute TTL). */
export const SESSION_TIMEOUT_COUNTDOWN_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export function clampSessionTimeoutMinutes(value: number): number {
  if (!Number.isFinite(value)) return SESSION_TIMEOUT_MIN_MINUTES;
  return Math.max(
    SESSION_TIMEOUT_MIN_MINUTES,
    Math.min(SESSION_TIMEOUT_MAX_MINUTES, Math.trunc(value)),
  );
}

/** True when remaining time should drive countdown UI and client auto-logout. */
export function shouldShowSessionCountdown(remainingMs: number | null | undefined): boolean {
  if (remainingMs == null || !Number.isFinite(remainingMs)) return false;
  return remainingMs <= SESSION_TIMEOUT_COUNTDOWN_HORIZON_MS;
}

/** Format remaining ms as mm:ss (<1h) or h:mm:ss. */
export function formatSessionCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Parse absolute expiry for countdown. Naive ISO (no Z / offset) is treated as UTC
 * so server `datetime.utcnow()` payloads are not misread as local time.
 */
export function parseExpiresAtMs(expiresAt: string): number | null {
  const raw = expiresAt.trim();
  if (!raw) return null;

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasTimezone ? raw : `${raw}Z`;
  const end = Date.parse(normalized);
  return Number.isNaN(end) ? null : end;
}

export function remainingMsUntil(expiresAt: string | null | undefined, now = Date.now()): number | null {
  if (!expiresAt) return null;
  const end = parseExpiresAtMs(expiresAt);
  if (end == null) return null;
  return end - now;
}
