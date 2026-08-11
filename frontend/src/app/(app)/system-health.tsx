import React from 'react';

import { SystemHealthScreen } from '@/modules/system_health';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function SystemHealthRoute() {
  return (
    <RouteErrorBoundary pageName="System Health">
      <AnimatedScreen>
        <SystemHealthScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
