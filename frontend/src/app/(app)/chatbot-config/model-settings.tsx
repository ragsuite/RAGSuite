import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function ModelSettingsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Model Settings' }} />
      <ChatbotConfigDetailScreen section="model" />
    </>
  );
}
