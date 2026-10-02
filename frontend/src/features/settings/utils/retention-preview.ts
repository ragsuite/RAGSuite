import type { RetentionEligibleCounts, RetentionPreview } from '@/network/actions/compliance.actions';

export type RetentionLimits = { minDays: number; maxDays: number };

export const DEFAULT_RETENTION_LIMITS: RetentionLimits = { minDays: 7, maxDays: 365 };

export const RETENTION_CONFIRMATION_WORD = 'DELETE';

/** Whole days within the limits; null while the input is empty, partial or out of range. */
export function parseRetentionDays(raw: string, limits: RetentionLimits = DEFAULT_RETENTION_LIMITS): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number.parseInt(text, 10);
  return n >= limits.minDays && n <= limits.maxDays ? n : null;
}

/** Mirrors the server rule: confirm when the change makes more stored data eligible for deletion. */
export function requiresDeleteConfirmation(
  saved: { autoDelete: boolean; retentionDays: number },
  draft: { autoDelete: boolean; retentionDays: number },
): boolean {
  if (!draft.autoDelete) return false;
  return !saved.autoDelete || draft.retentionDays < saved.retentionDays;
}

export function isDeleteConfirmed(value: string): boolean {
  return value.trim().toUpperCase() === RETENTION_CONFIRMATION_WORD;
}

export function totalEligibleItems(counts: RetentionEligibleCounts): number {
  return counts.chat_messages + counts.query_logs + counts.analytics_days + (counts.audit_events ?? 0);
}

export function formatRetentionDate(value?: string | null, locale?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale);
}

export function buildClientRetentionPreview(days: number, saved?: Partial<RetentionPreview>): RetentionPreview {
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const cutoff = new Date(now - days * msPerDay);
  const newExpiry = new Date(now + days * msPerDay);

  let daysUntilOldest: number | null = saved?.days_until_oldest_expires ?? null;
  if (saved?.oldest_interaction_at) {
    const oldest = new Date(saved.oldest_interaction_at);
    if (!Number.isNaN(oldest.getTime())) {
      const ageDays = Math.max(0, Math.floor((now - oldest.getTime()) / msPerDay));
      daysUntilOldest = Math.max(0, days - ageDays);
    }
  }

  return {
    cutoff_at: saved?.cutoff_at ?? cutoff.toISOString(),
    eligible_counts: saved?.eligible_counts ?? {
      chat_messages: 0,
      query_logs: 0,
      analytics_days: 0,
      audit_events: 0,
    },
    new_data_expires_at: saved?.new_data_expires_at ?? newExpiry.toISOString(),
    days_until_new_data_expires: days,
    oldest_interaction_at: saved?.oldest_interaction_at ?? null,
    days_until_oldest_expires: daysUntilOldest,
    next_purge_estimate_at: saved?.next_purge_estimate_at ?? null,
    auto_delete_active: Boolean(saved?.auto_delete_active),
  };
}

export function buildDraftRetentionPreview(
  saved: RetentionPreview | undefined,
  draftDays: number,
  savedDays: number,
): RetentionPreview {
  const base = buildClientRetentionPreview(draftDays, saved);
  if (draftDays === savedDays) {
    return base;
  }

  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const cutoff = new Date(now - draftDays * msPerDay);
  const newExpiry = new Date(now + draftDays * msPerDay);

  let daysUntilOldest: number | null = base.days_until_oldest_expires ?? null;
  if (base.oldest_interaction_at) {
    const oldest = new Date(base.oldest_interaction_at);
    if (!Number.isNaN(oldest.getTime())) {
      const ageDays = Math.max(0, Math.floor((now - oldest.getTime()) / msPerDay));
      daysUntilOldest = Math.max(0, draftDays - ageDays);
    }
  }

  return {
    ...base,
    cutoff_at: cutoff.toISOString(),
    new_data_expires_at: newExpiry.toISOString(),
    days_until_new_data_expires: draftDays,
    days_until_oldest_expires: daysUntilOldest,
  };
}
