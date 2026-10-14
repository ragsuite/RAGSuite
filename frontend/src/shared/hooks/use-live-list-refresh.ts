import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  createLiveRefreshScheduler,
  LIVE_REFRESH_POLL_INTERVAL_MS,
  type LiveRefreshScheduler,
} from '@/shared/hooks/live-refresh-scheduler';
import {
  subscribeAdminActivity,
  type AdminActivityKind,
} from '@/shared/utils/admin-activity-sync';

type UseLiveListRefreshOptions = {
  kind: AdminActivityKind;
  projectId?: string | null;
  enabled?: boolean;
  onRefresh: () => Promise<unknown>;
  pollIntervalMs?: number;
};

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisibility = () => setVisible(!document.hidden);
      onVisibility();
      document.addEventListener('visibilitychange', onVisibility);
      return () => document.removeEventListener('visibilitychange', onVisibility);
    }
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      setVisible(next === 'active');
    });
    return () => sub.remove();
  }, []);

  return visible;
}

/**
 * Keeps an admin list (History / Feedback) current without manual refresh:
 * instant on chatbot/search activity in this browser, plus a background poll while visible.
 */
export function useLiveListRefresh({
  kind,
  projectId,
  enabled = true,
  onRefresh,
  pollIntervalMs = LIVE_REFRESH_POLL_INTERVAL_MS,
}: UseLiveListRefreshOptions): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const schedulerRef = useRef<LiveRefreshScheduler | null>(null);
  const [focused, setFocused] = useState(true);
  const pageVisible = usePageVisible();
  const active = enabled && focused && pageVisible;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const scheduler = createLiveRefreshScheduler({
      refresh: async () => {
        await onRefreshRef.current();
      },
    });
    schedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const scopedProjectId = projectId?.trim() || null;
    return subscribeAdminActivity((detail) => {
      if (detail.kind !== kind) return;
      if (scopedProjectId && detail.projectId && detail.projectId !== scopedProjectId) return;
      schedulerRef.current?.trigger();
    });
  }, [enabled, kind, projectId]);

  const wasActiveRef = useRef(active);
  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) return;
    if (becameActive) schedulerRef.current?.runNow();
    const timer = setInterval(() => schedulerRef.current?.runNow(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [active, pollIntervalMs]);
}
