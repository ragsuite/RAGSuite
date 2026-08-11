import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function CitationFormattingRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Citation Formatting' }} />
      <SearchConfigDetailScreen section="citation" />
    </>
  );
}
