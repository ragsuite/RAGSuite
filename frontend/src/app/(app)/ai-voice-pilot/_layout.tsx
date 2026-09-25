import { Stack } from 'expo-router';
import React from 'react';

import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function AiVoicePilotLayout() {
  return (
    <RouteErrorBoundary pageName="AI Voice Pilot">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteErrorBoundary>
  );
}
