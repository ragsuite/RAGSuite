import { useCallback, useEffect, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchAuditEventById } from '@/features/audit-logs/services/audit-log.service';
import type { AuditEvent } from '@/features/audit-logs/types/audit-log.types';
import { getCachedAuditEvent } from '@/features/audit-logs/utils/audit-log-event-cache';

const DEFAULT_ERROR = 'Unable to load event details. Check your connection and try again.';

export function useAuditEventDetail(eventId: string | undefined) {
  const { isReady } = useAuthenticatedBootstrap();
  const [event, setEvent] = useState<AuditEvent | null>(() =>
    eventId ? getCachedAuditEvent(eventId) ?? null : null,
  );
  const [loading, setLoading] = useState(Boolean(eventId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) {
      setEvent(null);
      setLoading(false);
      setError('Missing event id.');
      return;
    }

    const stale = getCachedAuditEvent(eventId);
    if (stale) {
      setEvent(stale);
    }

    setLoading(true);
    setError(null);

    try {
      const loaded = await fetchAuditEventById(eventId);
      if (!loaded) {
        setEvent(stale ?? null);
        setError('This audit event could not be found.');
        return;
      }
      setEvent(loaded);
    } catch (err) {
      if (!stale) {
        setEvent(null);
        setError(err instanceof Error && err.message ? err.message : DEFAULT_ERROR);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void load();
  }, [isReady, load]);

  return { event, loading, error, reload: load };
}
