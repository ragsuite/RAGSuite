import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function ModelSettingsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Model settings' }} />
      <SearchConfigDetailScreen section="model" />
    </>
  );
}
