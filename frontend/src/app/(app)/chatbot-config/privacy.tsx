import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function ChatbotPrivacyRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy' }} />
      <ChatbotConfigDetailScreen section="privacy" />
    </>
  );
}
