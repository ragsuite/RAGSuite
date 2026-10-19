import { Redirect, Stack, type Href } from 'expo-router';
import React from 'react';

import { hrefForAppRoute } from '@/config/navigation';
import { ChatbotConfigDetailScreen } from '@/features/chatbot-config/screens/ChatbotConfigDetailScreen';
import { useShowWidgetModelSettings } from '@/features/model-configuration/hooks/useShowWidgetModelSettings';

export default function ModelSettingsRoute() {
  const showModelSettings = useShowWidgetModelSettings();
  if (!showModelSettings) {
    return <Redirect href={hrefForAppRoute('chatbot-config') as Href} />;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Model Settings' }} />
      <ChatbotConfigDetailScreen section="model" />
    </>
  );
}
