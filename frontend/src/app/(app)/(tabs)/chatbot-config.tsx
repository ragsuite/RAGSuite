import React from 'react';

import { ChatbotConfigScreen } from '@/features/chatbot-config/screens/ChatbotConfigScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function ChatbotConfigRoute() {
  return (
    <WorkspaceRouteGuard route="chatbot-config">
      <AnimatedScreen>
        <ChatbotConfigScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
