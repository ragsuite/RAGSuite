import React from 'react';
import { Stack } from 'expo-router';

import { SettingsDetailScreen } from '@/features/settings/screens/SettingsDetailScreen';

export default function SessionTimeoutRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Session timeout' }} />
      <SettingsDetailScreen tab="session" />
    </>
  );
}
