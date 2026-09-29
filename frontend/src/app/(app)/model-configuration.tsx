import React from 'react';

import { ModelConfigurationScreen } from '@/modules/model_configuration';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function ModelConfigurationRoute() {
  return (
    <RouteErrorBoundary pageName="Model Configuration">
      <AnimatedScreen>
        <ModelConfigurationScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
