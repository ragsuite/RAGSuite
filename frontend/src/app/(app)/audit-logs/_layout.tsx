import { Stack } from 'expo-router';
import React from 'react';

import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function AuditLogsLayout() {
  return (
    <WorkspaceRouteGuard route="audit-logs">
      <RouteErrorBoundary pageName="Audit Logs">
        <Stack screenOptions={{ headerShown: false }} />
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
