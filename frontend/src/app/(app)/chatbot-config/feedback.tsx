import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function ChatbotFeedbackRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Feedback' }} />
      <ChatbotConfigDetailScreen section="feedback" />
    </>
  );
}
