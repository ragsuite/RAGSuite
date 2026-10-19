import { Stack } from 'expo-router';
import React from 'react';

import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function ChatbotConfigLayout() {
  return (
    <WorkspaceRouteGuard route="chatbot-config">
      <RouteErrorBoundary pageName="Chatbot Configuration">
        <Stack screenOptions={{ headerShown: false }} />
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
