export const LIVE_REFRESH_DEBOUNCE_MS = 500;
/** Chat/search streams send `done` before the row is persisted — re-read once it has landed. */
export const LIVE_REFRESH_FOLLOW_UP_MS = 2_500;
export const LIVE_REFRESH_POLL_INTERVAL_MS = 10_000;

export type LiveRefreshScheduler = {
  /** Activity event: refresh after the debounce, then once more after the follow-up delay. */
  trigger: () => void;
  /** Refresh immediately (poll tick, page became visible). */
  runNow: () => void;
  dispose: () => void;
};

type SchedulerOptions = {
  refresh: () => Promise<void>;
  debounceMs?: number;
  followUpMs?: number;
};

export function createLiveRefreshScheduler({
  refresh,
  debounceMs = LIVE_REFRESH_DEBOUNCE_MS,
  followUpMs = LIVE_REFRESH_FOLLOW_UP_MS,
}: SchedulerOptions): LiveRefreshScheduler {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let followUpTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let rerunQueued = false;
  let disposed = false;

  const clearTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (followUpTimer) clearTimeout(followUpTimer);
    debounceTimer = null;
    followUpTimer = null;
  };

  const runNow = () => {
    if (disposed) return;
    if (inFlight) {
      rerunQueued = true;
      return;
    }
    inFlight = true;
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
        if (rerunQueued && !disposed) {
          rerunQueued = false;
          runNow();
        }
      });
  };

  return {
    trigger: () => {
      if (disposed) return;
      clearTimers();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        runNow();
      }, debounceMs);
      followUpTimer = setTimeout(() => {
        followUpTimer = null;
        runNow();
      }, followUpMs);
    },
    runNow,
    dispose: () => {
      disposed = true;
      rerunQueued = false;
      clearTimers();
    },
  };
}
