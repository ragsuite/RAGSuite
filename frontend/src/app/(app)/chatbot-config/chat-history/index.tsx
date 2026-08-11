import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigTrainingDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigTrainingDetailScreen';

export default function ChatbotChatHistoryRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Chat history' }} />
      <ChatbotConfigTrainingDetailScreen panel="history" historyLayout="list" />
    </>
  );
}
