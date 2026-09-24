import React from 'react';

import { McpScreen } from '@/features/mcp/screens/McpScreen';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function McpRoute() {
  return (
    <RouteErrorBoundary pageName="MCP">
      <AnimatedScreen>
        <McpScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
