import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function ChatWidgetCustomizationRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Customization' }} />
      <ChatbotConfigDetailScreen section="widget-customization" />
    </>
  );
}
