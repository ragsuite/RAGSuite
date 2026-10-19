import React from 'react';

import { ModelConfigurationScreen } from '@/modules/model_configuration';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function ModelConfigurationRoute() {
  return (
    <WorkspaceRouteGuard route="model-configuration">
      <RouteErrorBoundary pageName="Model Configuration">
        <AnimatedScreen>
          <ModelConfigurationScreen />
        </AnimatedScreen>
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
