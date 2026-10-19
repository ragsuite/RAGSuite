import React from 'react';

import { SystemHealthScreen } from '@/modules/system_health';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function SystemHealthRoute() {
  return (
    <WorkspaceRouteGuard route="system-health">
      <RouteErrorBoundary pageName="System Health">
        <AnimatedScreen>
          <SystemHealthScreen />
        </AnimatedScreen>
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
