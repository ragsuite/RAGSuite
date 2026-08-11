import { Stack } from 'expo-router';
import React from 'react';

import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function CompareModelsLayout() {
  return (
    <RouteErrorBoundary pageName="Compare Models">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteErrorBoundary>
  );
}
