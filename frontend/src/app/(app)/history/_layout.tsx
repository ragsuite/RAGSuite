import { Stack } from 'expo-router';
import React from 'react';

import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function ChatHistoryLayout() {
  return (
    <RouteErrorBoundary pageName="History">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteErrorBoundary>
  );
}
