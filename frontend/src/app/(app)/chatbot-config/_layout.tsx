import { Stack } from 'expo-router';
import React from 'react';

import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function ChatbotConfigLayout() {
  return (
    <RouteErrorBoundary pageName="Chatbot Configuration">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteErrorBoundary>
  );
}
