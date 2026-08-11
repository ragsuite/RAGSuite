import React, { useCallback, useState } from 'react';

import { AppErrorBoundary } from '@/shared/components/error/app-error-boundary';

type Props = {
  children: React.ReactNode;
  /** Label for logging / future diagnostics (reference `componentName`). */
  componentName?: string;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
};

/**
 * Inline component-level boundary — parity with reference `ComponentErrorBoundary`
 * (e.g. SearchBar). Isolates a leaf crash so the rest of the page stays usable.
 */
export function ComponentErrorBoundary({ children, componentName, fallback, onError }: Props) {
  const [remountKey, setRemountKey] = useState(0);

  const onRetry = useCallback(() => {
    setRemountKey((key) => key + 1);
  }, []);

  return (
    <AppErrorBoundary
      key={remountKey}
      level="component"
      fallback={fallback}
      onError={onError}
      onRetry={onRetry}
      resetKeys={[remountKey, componentName ?? '']}>
      {children}
    </AppErrorBoundary>
  );
}
