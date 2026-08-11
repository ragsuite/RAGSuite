import React from 'react';

import { ChatHistoryScreen } from '@/features/chat-history/screens/ChatHistoryScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function ChatHistoryRoute() {
  return (
    <WorkspaceRouteGuard route="history">
      <AnimatedScreen>
        <ChatHistoryScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
