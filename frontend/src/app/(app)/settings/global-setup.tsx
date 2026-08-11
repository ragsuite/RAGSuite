import React from 'react';
import { Stack } from 'expo-router';

import { SettingsDetailScreen } from '@/features/settings/screens/SettingsDetailScreen';

export default function GlobalSetupRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Global Settings' }} />
      <SettingsDetailScreen tab="global" />
    </>
  );
}
