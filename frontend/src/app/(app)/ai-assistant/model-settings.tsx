import React from 'react';

import { AiAssistantSettingsScreen } from '@/modules/ai_assistant';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function AiAssistantModelSettingsRoute() {
  return (
    <RouteErrorBoundary pageName="Admin Assistant Models">
      <AnimatedScreen>
        <AiAssistantSettingsScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
