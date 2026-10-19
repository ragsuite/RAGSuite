import { Stack } from 'expo-router';
import React from 'react';

import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function ChatHistoryLayout() {
  return (
    <WorkspaceRouteGuard route="history">
      <RouteErrorBoundary pageName="History">
        <Stack screenOptions={{ headerShown: false }} />
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
