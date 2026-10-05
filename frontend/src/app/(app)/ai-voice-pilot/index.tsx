import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { AiVoicePilotScreen } from '@/features/ai-voice-pilot/screens/AiVoicePilotScreen';
import { requestChatbotVoicePilot } from '@/features/chatbot-config/utils/chatbot-pending-primary-tab';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function AiVoicePilotRoute() {
  const router = useRouter();
  const { canAccessRoute } = useActiveProject();
  const redirectToChatbotVoice = canAccessRoute('chatbot-config');

  useEffect(() => {
    if (!redirectToChatbotVoice) return;
    requestChatbotVoicePilot();
    router.replace('/(app)/(tabs)/chatbot-config');
  }, [redirectToChatbotVoice, router]);

  if (redirectToChatbotVoice) {
    return null;
  }

  return (
    <WorkspaceRouteGuard route="ai-voice-pilot">
      <AnimatedScreen>
        <AiVoicePilotScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
