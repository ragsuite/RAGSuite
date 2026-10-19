import { Stack } from 'expo-router';
import React from 'react';

import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function FeedbackModerationLayout() {
  return (
    <WorkspaceRouteGuard route="feedback-moderation">
      <RouteErrorBoundary pageName="Feedback">
        <Stack screenOptions={{ headerShown: false }} />
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
