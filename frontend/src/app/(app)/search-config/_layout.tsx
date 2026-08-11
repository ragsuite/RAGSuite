import { Stack } from 'expo-router';
import React from 'react';

import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function SearchConfigLayout() {
  return (
    <RouteErrorBoundary pageName="Search Configuration">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteErrorBoundary>
  );
}
