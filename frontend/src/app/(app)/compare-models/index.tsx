import React from 'react';

import { CompareModelsScreen } from '@/features/compare-models/screens/CompareModelsScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function CompareModelsRoute() {
  return (
    <WorkspaceRouteGuard route="compare-models">
      <AnimatedScreen>
        <CompareModelsScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
