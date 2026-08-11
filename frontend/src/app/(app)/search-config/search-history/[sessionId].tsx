import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { SearchConfigTrainingDetailScreen } from '@/features/search-config/screens/SearchConfigTrainingDetailScreen';

export default function SearchHistorySessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Search session', headerBackTitle: 'Back' }} />
      <SearchConfigTrainingDetailScreen
        panel="history"
        historyLayout="detail"
        sessionId={typeof sessionId === 'string' ? sessionId : undefined}
      />
    </>
  );
}
