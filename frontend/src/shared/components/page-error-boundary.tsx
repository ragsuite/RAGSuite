import React, { useCallback, useState } from 'react';

import { AppErrorBoundary } from '@/shared/components/error/app-error-boundary';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

type Props = {
  children: React.ReactNode;
  onRetry: () => void;
  title?: string;
};

/**
 * Page-level boundary with remount-via-key retry (crawl/configuration parity).
 * Prefer {@link RouteErrorBoundary} for new call sites (owns remount key internally).
 */
export function PageErrorBoundary({ children, onRetry }: Props) {
  return (
    <AppErrorBoundary level="page" onRetry={onRetry}>
      {children}
    </AppErrorBoundary>
  );
}

/** Convenience: self-remounting page boundary for layouts/screens. */
export function PageErrorBoundaryWithRemount({ children }: { children: React.ReactNode }) {
  const [remountKey, setRemountKey] = useState(0);
  const onRetry = useCallback(() => setRemountKey((key) => key + 1), []);
  return (
    <PageErrorBoundary key={remountKey} onRetry={onRetry}>
      {children}
    </PageErrorBoundary>
  );
}

export { RouteErrorBoundary };
