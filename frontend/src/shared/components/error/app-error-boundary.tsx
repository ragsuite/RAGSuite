import React from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { ErrorStateCard } from '@/shared/components/error/error-state-card';

type Level = 'page' | 'component' | 'critical';

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  level?: Level;
  /** Called when user taps Try Again (page/component). Parent may remount via key. */
  onRetry?: () => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
  errorId: string;
};

/**
 * Reference-parity ErrorBoundary (critical / page / component levels).
 * @see `/Users/guru/Downloads/frontend/client/src/components/error/ErrorBoundary.tsx`
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorId: '',
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (__DEV__) {
      console.error('[AppErrorBoundary]', error, errorInfo);
    }
    this.props.onError?.(error, errorInfo);

    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('app-errors') || '[]') as unknown[];
        existing.push({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          level: this.props.level ?? 'component',
          errorId: this.state.errorId,
        });
        localStorage.setItem('app-errors', JSON.stringify(existing.slice(-10)));
      }
    } catch {
      // ignore storage failures
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange, children } = this.props;
    const { hasError } = this.state;

    if (hasError && prevProps.resetKeys !== resetKeys && prevProps.resetKeys && resetKeys) {
      const changed = prevProps.resetKeys.some((key, index) => key !== resetKeys[index]);
      if (changed) this.resetErrorBoundary();
    }

    if (hasError && resetOnPropsChange && prevProps.children !== children) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null, errorId: '' });
  };

  private handleRetry = () => {
    this.resetErrorBoundary();
    this.props.onRetry?.();
  };

  private handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.handleRetry();
  };

  render() {
    const { hasError, error, errorId } = this.state;
    const { children, fallback, level = 'component' } = this.props;

    if (!hasError) return children;
    if (fallback) return fallback;

    return (
      <ErrorBoundaryFallback
        level={level}
        error={error}
        errorId={errorId}
        onRetry={this.handleRetry}
        onReload={this.handleReload}
      />
    );
  }
}

function ErrorBoundaryFallback({
  level,
  error,
  errorId,
  onRetry,
  onReload,
}: {
  level: Level;
  error: Error | null;
  errorId: string;
  onRetry: () => void;
  onReload: () => void;
}) {
  const router = useRouter();

  if (level === 'critical') {
    return (
      <ErrorStateCard
        variant="critical"
        errorId={errorId}
        errorMessage={error?.message}
        onPrimary={onReload}
      />
    );
  }

  if (level === 'page') {
    return (
      <ErrorStateCard
        variant="page"
        errorId={errorId}
        errorMessage={error?.message}
        onPrimary={onRetry}
        onSecondary={() => {
          try {
            router.replace('/(app)/(tabs)');
          } catch {
            onReload();
          }
        }}
      />
    );
  }

  return (
    <ErrorStateCard
      variant="component"
      errorId={errorId}
      errorMessage={error?.message}
      onPrimary={onRetry}
    />
  );
}

/** Back-compat wrapper used by crawl / configuration remount pattern. */
export { AppErrorBoundary as PageErrorBoundaryClass };
