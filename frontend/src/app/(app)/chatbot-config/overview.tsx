import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function ChatbotOverviewRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Overview' }} />
      <ChatbotConfigDetailScreen section="overview" />
    </>
  );
}
