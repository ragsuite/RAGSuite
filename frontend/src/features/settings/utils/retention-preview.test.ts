import { buildClientRetentionPreview, buildDraftRetentionPreview, formatRetentionDate } from './retention-preview';

describe('formatRetentionDate', () => {
  it('returns em dash for empty values', () => {
    expect(formatRetentionDate(null)).toBe('—');
    expect(formatRetentionDate(undefined)).toBe('—');
  });

  it('formats valid ISO dates', () => {
    const formatted = formatRetentionDate('2026-06-02T14:00:00.000Z', 'en-US');
    expect(formatted).not.toBe('—');
    expect(formatted).toContain('2026');
  });
});

describe('buildClientRetentionPreview', () => {
  it('builds countdown fields from retention days', () => {
    const preview = buildClientRetentionPreview(90);
    expect(preview.days_until_new_data_expires).toBe(90);
    expect(preview.new_data_expires_at).toBeTruthy();
    expect(preview.cutoff_at).toBeTruthy();
  });
});

describe('buildDraftRetentionPreview', () => {
  const saved = {
    eligible_counts: { chat_messages: 5, query_logs: 3, analytics_days: 1, audit_events: 2 },
    days_until_new_data_expires: 90,
    auto_delete_active: true,
    cutoff_at: '2026-03-01T00:00:00.000Z',
    new_data_expires_at: '2026-11-28T00:00:00.000Z',
  };

  it('returns saved preview when draft days match', () => {
    const preview = buildDraftRetentionPreview(saved, 90, 90);
    expect(preview.eligible_counts).toEqual(saved.eligible_counts);
    expect(preview.days_until_new_data_expires).toBe(90);
  });

  it('recalculates expiry dates when draft days change', () => {
    const draft = buildDraftRetentionPreview(saved, 60, 90);
    expect(draft.days_until_new_data_expires).toBe(60);
    expect(draft.new_data_expires_at).not.toBe(saved.new_data_expires_at);
    expect(draft.cutoff_at).not.toBe(saved.cutoff_at);
    expect(draft.eligible_counts).toEqual(saved.eligible_counts);
  });
});
