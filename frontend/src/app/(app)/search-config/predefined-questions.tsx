import React from 'react';
import { Stack } from 'expo-router';

import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function PredefinedQuestionsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Predefined Questions Configuration' }} />
      <SearchConfigDetailScreen section="predefined" />
    </>
  );
}
