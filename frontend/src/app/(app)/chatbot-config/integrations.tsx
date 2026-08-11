import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigIntegrationsDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigIntegrationsDetailScreen';

export default function ChatbotIntegrationsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Integrations' }} />
      <ChatbotConfigIntegrationsDetailScreen />
    </>
  );
}
