export type AuditHistoryLockState = {
  /** Visible history window from the API; null when the edition keeps full history. */
  retentionDays: number | null;
  loading: boolean;
  error: string | null;
  listIsEmpty: boolean;
  paginationMode: 'paged' | 'append';
  page: number;
  totalPages: number;
  hasMore: boolean;
};

/** Show the Enterprise lock only at the end of a windowed (Community) audit list. */
export function shouldShowAuditHistoryLock(state: AuditHistoryLockState): boolean {
  if (state.retentionDays == null || state.loading || state.error) return false;
  if (state.listIsEmpty) return true;
  if (state.paginationMode === 'paged') return state.page >= state.totalPages;
  return !state.hasMore;
}
