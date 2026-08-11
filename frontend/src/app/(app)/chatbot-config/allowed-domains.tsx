import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function AllowedDomainsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Allowed Domains' }} />
      <ChatbotConfigDetailScreen section="domains" />
    </>
  );
}
