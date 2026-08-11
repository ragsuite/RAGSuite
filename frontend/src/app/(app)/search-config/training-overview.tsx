import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigTrainingDetailScreen } from '@/features/search-config/screens/SearchConfigTrainingDetailScreen';

export default function SearchTrainingOverviewRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Overview' }} />
      <SearchConfigTrainingDetailScreen panel="overview" />
    </>
  );
}
