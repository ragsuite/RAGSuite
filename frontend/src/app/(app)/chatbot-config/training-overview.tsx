import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigTrainingDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigTrainingDetailScreen';

export default function ChatbotTrainingOverviewRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Overview' }} />
      <ChatbotConfigTrainingDetailScreen panel="overview" />
    </>
  );
}
