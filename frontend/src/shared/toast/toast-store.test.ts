import {
  createToastRecord,
  findDuplicateToastId,
  normalizeToastInput,
} from '@/shared/toast/toast-store';
import type { ToastRecord } from '@/shared/toast/toast.types';

describe('toast-store', () => {
  it('normalizes string input into a default toast description', () => {
    const normalized = normalizeToastInput('Saved changes');

    expect(normalized).toMatchObject({
      title: undefined,
      description: 'Saved changes',
      variant: 'default',
    });
  });

  it('maps destructive variant to error', () => {
    const normalized = normalizeToastInput({
      title: 'Session expired',
      description: 'Please sign in again.',
      variant: 'destructive',
    });

    expect(normalized).toMatchObject({
      title: 'Session expired',
      description: 'Please sign in again.',
      variant: 'error',
    });
  });

  it('suppresses duplicate active toasts inside the dedupe window', () => {
    const existing: ToastRecord = createToastRecord(
      { title: 'Saved', description: 'Changes saved', variant: 'success' },
      {
        id: 'toast-1',
        now: 1_000,
      },
    );

    const duplicateId = findDuplicateToastId(
      [existing],
      { title: 'Saved', description: 'Changes saved', variant: 'success' },
      2_000,
      1_800,
    );

    expect(duplicateId).toBe('toast-1');
  });
});
