import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigTrainingDetailScreen } from '@/features/search-config/screens/SearchConfigTrainingDetailScreen';

export default function SearchTrainingActiveConfigRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Active config' }} />
      <SearchConfigTrainingDetailScreen panel="active-config" />
    </>
  );
}
