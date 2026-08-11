import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigTrainingDetailScreen } from '@/features/search-config/screens/SearchConfigTrainingDetailScreen';

export default function SearchTrainingHistoryRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Search history' }} />
      <SearchConfigTrainingDetailScreen panel="history" historyLayout="list" />
    </>
  );
}
