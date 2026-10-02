import {
  buildClientRetentionPreview,
  buildDraftRetentionPreview,
  formatRetentionDate,
  isDeleteConfirmed,
  parseRetentionDays,
  requiresDeleteConfirmation,
  totalEligibleItems,
} from './retention-preview';

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

describe('parseRetentionDays', () => {
  it('accepts whole days within the limits', () => {
    expect(parseRetentionDays('7')).toBe(7);
    expect(parseRetentionDays(' 90 ')).toBe(90);
    expect(parseRetentionDays('365')).toBe(365);
    expect(parseRetentionDays('45', { minDays: 30, maxDays: 60 })).toBe(45);
  });

  it('never substitutes a value for empty, partial or out-of-range input', () => {
    expect(parseRetentionDays('')).toBeNull();
    expect(parseRetentionDays('   ')).toBeNull();
    expect(parseRetentionDays('3')).toBeNull();
    expect(parseRetentionDays('900')).toBeNull();
    expect(parseRetentionDays('9.5')).toBeNull();
    expect(parseRetentionDays('-30')).toBeNull();
  });
});

describe('requiresDeleteConfirmation', () => {
  it('asks only when more stored data becomes eligible for deletion', () => {
    expect(requiresDeleteConfirmation({ autoDelete: false, retentionDays: 90 }, { autoDelete: true, retentionDays: 90 })).toBe(true);
    expect(requiresDeleteConfirmation({ autoDelete: true, retentionDays: 90 }, { autoDelete: true, retentionDays: 30 })).toBe(true);
    expect(requiresDeleteConfirmation({ autoDelete: true, retentionDays: 30 }, { autoDelete: true, retentionDays: 90 })).toBe(false);
    expect(requiresDeleteConfirmation({ autoDelete: true, retentionDays: 90 }, { autoDelete: false, retentionDays: 30 })).toBe(false);
  });
});

describe('isDeleteConfirmed', () => {
  it('accepts DELETE in any case with surrounding spaces', () => {
    expect(isDeleteConfirmed(' delete ')).toBe(true);
    expect(isDeleteConfirmed('DEL')).toBe(false);
  });
});

describe('totalEligibleItems', () => {
  it('sums every store', () => {
    expect(totalEligibleItems({ chat_messages: 2, query_logs: 3, analytics_days: 1, audit_events: 4 })).toBe(10);
  });
});
