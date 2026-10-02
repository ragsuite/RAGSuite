import {
  shouldShowAuditHistoryLock,
  type AuditHistoryLockState,
} from '@/features/audit-logs/utils/audit-history-lock';

const base: AuditHistoryLockState = {
  retentionDays: 15,
  loading: false,
  error: null,
  listIsEmpty: false,
  paginationMode: 'paged',
  page: 1,
  totalPages: 1,
  hasMore: false,
};

describe('shouldShowAuditHistoryLock', () => {
  it('never shows when the edition keeps full history', () => {
    expect(shouldShowAuditHistoryLock({ ...base, retentionDays: null })).toBe(false);
    expect(shouldShowAuditHistoryLock({ ...base, retentionDays: null, listIsEmpty: true })).toBe(false);
  });

  it('hides while loading or on error', () => {
    expect(shouldShowAuditHistoryLock({ ...base, loading: true })).toBe(false);
    expect(shouldShowAuditHistoryLock({ ...base, error: 'boom' })).toBe(false);
  });

  it('shows only on the last page in paged mode', () => {
    expect(shouldShowAuditHistoryLock({ ...base, page: 1, totalPages: 3 })).toBe(false);
    expect(shouldShowAuditHistoryLock({ ...base, page: 3, totalPages: 3 })).toBe(true);
  });

  it('shows only after the final append in append mode', () => {
    const append = { ...base, paginationMode: 'append' as const };
    expect(shouldShowAuditHistoryLock({ ...append, hasMore: true })).toBe(false);
    expect(shouldShowAuditHistoryLock({ ...append, hasMore: false })).toBe(true);
  });

  it('shows below an empty Community list', () => {
    expect(shouldShowAuditHistoryLock({ ...base, listIsEmpty: true, totalPages: 0 })).toBe(true);
  });
});
