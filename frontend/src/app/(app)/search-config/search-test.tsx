import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function SearchTestRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Search Test' }} />
      <SearchConfigDetailScreen section="search-test" />
    </>
  );
}
