import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function SearchPrivacyRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Data Processing Agreement' }} />
      <SearchConfigDetailScreen section="privacy" />
    </>
  );
}
