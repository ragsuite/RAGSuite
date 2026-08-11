import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

import type { ToastId, ToastInput, ToastOptions, ToastRecord } from '@/shared/toast/toast.types';
import {
  getToastListSnapshot,
  subscribeToastList,
  updateToastList,
} from '@/shared/toast/toast-list-subscription';
import { MAX_TOASTS, createToastRecord, findDuplicateToastId, normalizeToastInput } from '@/shared/toast/toast-store';

type ToastActions = {
  toast: (input: ToastInput, options?: ToastOptions) => ToastId;
  dismiss: (id: ToastId) => void;
  update: (id: ToastId, input: ToastInput, options?: ToastOptions) => void;
  pause: (id: ToastId) => void;
  resume: (id: ToastId) => void;
  pauseAll: () => void;
  resumeAll: () => void;
};

type ToastContextValue = ToastActions & {
  toasts: ToastRecord[];
};

const ToastActionsContext = createContext<ToastActions | null>(null);

type Props = {
  children: React.ReactNode;
};

type ToastTimerEntry = {
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
  remainingMs: number;
};

export function ToastProvider({ children }: Props) {
  const timersRef = useRef(new Map<ToastId, ToastTimerEntry>());

  const clearToastTimer = useCallback((id: ToastId) => {
    const entry = timersRef.current.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: ToastId) => {
      clearToastTimer(id);
      updateToastList((current) => current.filter((toast) => toast.id !== id));
    },
    [clearToastTimer],
  );

  const scheduleToast = useCallback(
    (record: ToastRecord) => {
      clearToastTimer(record.id);
      if (record.durationMs <= 0 || record.remainingMs <= 0 || record.paused) return;

      const timer = setTimeout(() => {
        dismiss(record.id);
      }, record.remainingMs);
      timersRef.current.set(record.id, {
        timer,
        startedAt: record.startedAt,
        remainingMs: record.remainingMs,
      });
    },
    [clearToastTimer, dismiss],
  );

  const syncTimers = useCallback(
    (toasts: readonly ToastRecord[]) => {
      const activeIds = new Set<ToastId>();

      toasts.forEach((toastRecord) => {
        activeIds.add(toastRecord.id);

        if (toastRecord.durationMs <= 0 || toastRecord.remainingMs <= 0 || toastRecord.paused) {
          clearToastTimer(toastRecord.id);
          return;
        }

        const existingTimer = timersRef.current.get(toastRecord.id);
        if (
          existingTimer &&
          existingTimer.startedAt === toastRecord.startedAt &&
          existingTimer.remainingMs === toastRecord.remainingMs
        ) {
          return;
        }

        scheduleToast(toastRecord);
      });

      timersRef.current.forEach((_entry, id) => {
        if (!activeIds.has(id)) {
          clearToastTimer(id);
        }
      });
    },
    [clearToastTimer, scheduleToast],
  );

  const pause = useCallback(
    (id: ToastId) => {
      const now = Date.now();
      clearToastTimer(id);
      updateToastList((current) =>
        current.map((toast) => {
          if (toast.id !== id || toast.paused) return toast;
          const elapsed = Math.max(0, now - toast.startedAt);
          return {
            ...toast,
            remainingMs: Math.max(0, toast.remainingMs - elapsed),
            paused: true,
          };
        }),
      );
    },
    [clearToastTimer],
  );

  const resume = useCallback((id: ToastId) => {
    const now = Date.now();
    updateToastList((current) =>
      current.map((toast) => {
        if (toast.id !== id || !toast.paused) return toast;
        return {
          ...toast,
          startedAt: now,
          paused: false,
        };
      }),
    );
  }, []);

  const pauseAll = useCallback(() => {
    getToastListSnapshot().forEach((toast) => pause(toast.id));
  }, [pause]);

  const resumeAll = useCallback(() => {
    getToastListSnapshot().forEach((toast) => resume(toast.id));
  }, [resume]);

  const toast = useCallback((input: ToastInput, options?: ToastOptions) => {
    const normalized = normalizeToastInput(input, options);
    if (!normalized.description && !normalized.title) {
      return normalized.id ?? '';
    }

    const now = Date.now();
    const current = getToastListSnapshot();

    if (normalized.id && current.some((toastRecord) => toastRecord.id === normalized.id)) {
      return normalized.id;
    }

    const duplicateId = findDuplicateToastId([...current], normalized, now);
    if (duplicateId) return duplicateId;

    const record = createToastRecord(normalized, {
      id: normalized.id,
      now,
      durationMs: normalized.durationMs,
    });

    updateToastList((prev) => [...prev, record].slice(-MAX_TOASTS));
    return record.id;
  }, []);

  const update = useCallback((id: ToastId, input: ToastInput, options?: ToastOptions) => {
    const normalized = normalizeToastInput(input, options);
    const now = Date.now();

    updateToastList((current) =>
      current.map((toastRecord) => {
        if (toastRecord.id !== id) return toastRecord;
        return createToastRecord(normalized, {
          id,
          now,
          durationMs: normalized.durationMs ?? toastRecord.durationMs,
        });
      }),
    );
  }, []);

  useEffect(() => {
    return subscribeToastList(() => {
      syncTimers(getToastListSnapshot());
    });
  }, [syncTimers]);

  useEffect(() => {
    syncTimers(getToastListSnapshot());
  }, [syncTimers]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((entry) => clearTimeout(entry.timer));
      timers.clear();
      updateToastList(() => []);
    };
  }, []);

  const actionsValue = useMemo<ToastActions>(
    () => ({
      toast,
      dismiss,
      update,
      pause,
      resume,
      pauseAll,
      resumeAll,
    }),
    [dismiss, pause, pauseAll, resume, resumeAll, toast, update],
  );

  return <ToastActionsContext.Provider value={actionsValue}>{children}</ToastActionsContext.Provider>;
}

export function useToastActionsContext(): ToastActions {
  const context = useContext(ToastActionsContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}

/** @deprecated Prefer subscribeToastList + getToastListSnapshot in viewport code. */
export function useToastListContext(): ToastRecord[] {
  // Kept for backwards compatibility; viewport should use useSyncExternalStore instead.
  return [...getToastListSnapshot()];
}

/** @deprecated Prefer useToastActionsContext / useToast from use-toast.ts */
export function useToastContext(): ToastContextValue {
  return {
    ...useToastActionsContext(),
    toasts: [...getToastListSnapshot()],
  };
}
