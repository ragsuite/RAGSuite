import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function SearchBoxConfigurationRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Search Box Configuration' }} />
      <SearchConfigDetailScreen section="search-box" />
    </>
  );
}
