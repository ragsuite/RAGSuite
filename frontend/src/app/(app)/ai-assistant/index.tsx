import React from 'react';

import { AiAssistantScreen } from '@/modules/ai_assistant';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function AiAssistantRoute() {
  return (
    <RouteErrorBoundary pageName="AI Assistant">
      <AnimatedScreen>
        <AiAssistantScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
