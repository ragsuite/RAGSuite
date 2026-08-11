import { Stack } from 'expo-router';
import React from 'react';

import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function AuditLogsLayout() {
  return (
    <RouteErrorBoundary pageName="Audit Logs">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteErrorBoundary>
  );
}
