import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function ChatbotFaqRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'FAQ' }} />
      <ChatbotConfigDetailScreen section="faq" />
    </>
  );
}
