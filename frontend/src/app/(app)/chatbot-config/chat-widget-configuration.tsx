import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function ChatWidgetConfigurationRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Configuration' }} />
      <ChatbotConfigDetailScreen section="widget-config" />
    </>
  );
}
