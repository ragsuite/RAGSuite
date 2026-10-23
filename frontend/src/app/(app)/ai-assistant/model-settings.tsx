import { Redirect } from 'expo-router';
import React from 'react';

import { AiAssistantSettingsScreen } from '@/modules/ai_assistant';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function AiAssistantModelSettingsRoute() {
  const { hasPermission } = useActiveProject();
  if (!hasPermission('ai_assistant:read')) {
    return <Redirect href="/(app)/ai-assistant" />;
  }

  return (
    <RouteErrorBoundary pageName="Admin Assistant Models">
      <AnimatedScreen>
        <AiAssistantSettingsScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
