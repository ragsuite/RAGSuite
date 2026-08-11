import React, { useCallback, useState } from 'react';

import { AppErrorBoundary } from '@/shared/components/error/app-error-boundary';

type Props = {
  children: React.ReactNode;
  /** Optional label for future logging; unused in UI. */
  pageName?: string;
};

/**
 * Page-level error boundary with built-in remount-on-retry.
 * Prefer this over local remountKey state in route files.
 */
export function RouteErrorBoundary({ children, pageName }: Props) {
  const [remountKey, setRemountKey] = useState(0);

  const onRetry = useCallback(() => {
    setRemountKey((key) => key + 1);
  }, []);

  return (
    <AppErrorBoundary key={remountKey} level="page" onRetry={onRetry} resetKeys={[remountKey, pageName ?? '']}>
      {children}
    </AppErrorBoundary>
  );
}
