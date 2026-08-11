import React from 'react';
import { Stack } from 'expo-router';

import { SettingsDetailScreen } from '@/features/settings/screens/SettingsDetailScreen';

export default function DataRetentionsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Data retentions' }} />
      <SettingsDetailScreen tab="retention" />
    </>
  );
}
