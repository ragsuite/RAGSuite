import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigTrainingDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigTrainingDetailScreen';

export default function ChatbotTrainingActiveConfigRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Active config' }} />
      <ChatbotConfigTrainingDetailScreen panel="active-config" />
    </>
  );
}
