import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function ChatbotPrivacyPolicyRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy Policy' }} />
      <ChatbotConfigDetailScreen section="privacy-policy" />
    </>
  );
}
