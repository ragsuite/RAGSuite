import React from 'react';

import { AiVoicePilotScreen } from '@/features/ai-voice-pilot/screens/AiVoicePilotScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function AiVoicePilotRoute() {
  return (
    <WorkspaceRouteGuard route="ai-voice-pilot">
      <AnimatedScreen>
        <AiVoicePilotScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
