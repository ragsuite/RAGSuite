import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function IntegrationsScriptsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Integrations' }} />
      <SearchConfigDetailScreen section="integrations" />
    </>
  );
}
