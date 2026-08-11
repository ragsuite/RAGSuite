import React from 'react';
import { Stack } from 'expo-router';

import { SettingsDetailScreen } from '@/features/settings/screens/SettingsDetailScreen';

export default function LanguageRegionRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Language & Region' }} />
      <SettingsDetailScreen tab="intl" />
    </>
  );
}
