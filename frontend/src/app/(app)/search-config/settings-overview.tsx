import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function SettingsOverviewRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Overview' }} />
      <SearchConfigDetailScreen section="overview" />
    </>
  );
}
