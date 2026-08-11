import { Stack } from 'expo-router';
import React from 'react';

import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function FeedbackModerationLayout() {
  return (
    <RouteErrorBoundary pageName="Feedback">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteErrorBoundary>
  );
}
