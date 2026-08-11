import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function SearchBoxCustomizationRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Search Box Customisation' }} />
      <SearchConfigDetailScreen section="search-customization" />
    </>
  );
}
