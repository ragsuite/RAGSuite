import React, { useState } from 'react';

import { ConfigurationScreen } from '@/features/configuration/screens/ConfigurationScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';
import { PageErrorBoundary } from '@/shared/components/page-error-boundary';

export default function ConfigurationRoute() {
  const [remountKey, setRemountKey] = useState(0);

  return (
    <WorkspaceRouteGuard route="configuration">
      <AnimatedScreen>
        <PageErrorBoundary key={remountKey} onRetry={() => setRemountKey((key) => key + 1)}>
          <ConfigurationScreen />
        </PageErrorBoundary>
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
