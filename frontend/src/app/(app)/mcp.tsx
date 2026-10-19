import React from 'react';

import { McpScreen } from '@/features/mcp/screens/McpScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function McpRoute() {
  return (
    <WorkspaceRouteGuard route="mcp">
      <RouteErrorBoundary pageName="MCP">
        <AnimatedScreen>
          <McpScreen />
        </AnimatedScreen>
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
