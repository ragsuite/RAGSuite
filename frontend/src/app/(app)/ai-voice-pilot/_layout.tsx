import { Stack } from 'expo-router';
import React from 'react';

import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function AiVoicePilotLayout() {
  return (
    <WorkspaceRouteGuard route="ai-voice-pilot">
      <RouteErrorBoundary pageName="AI Voice Pilot">
        <Stack screenOptions={{ headerShown: false }} />
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
