import React from 'react';
import { Stack } from 'expo-router';

import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';

export default function VoicePilotSettingsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Voice Pilot' }} />
      <ChatbotConfigDetailScreen section="voice-pilot" />
    </>
  );
}
