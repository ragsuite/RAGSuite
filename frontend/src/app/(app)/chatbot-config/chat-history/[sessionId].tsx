import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ChatbotConfigTrainingDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigTrainingDetailScreen';

export default function ChatbotChatHistorySessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Conversation', headerBackTitle: 'Back' }} />
      <ChatbotConfigTrainingDetailScreen
        panel="history"
        historyLayout="detail"
        sessionId={typeof sessionId === 'string' ? sessionId : undefined}
      />
    </>
  );
}
