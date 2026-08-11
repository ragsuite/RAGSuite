import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function AllowedDomainsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Allowed Domains' }} />
      <SearchConfigDetailScreen section="domains" />
    </>
  );
}
