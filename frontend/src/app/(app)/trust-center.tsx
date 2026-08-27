import React from 'react';

import { TrustCenterScreen } from '@/modules/trust_center';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function TrustCenterRoute() {
  return (
    <RouteErrorBoundary pageName="Trust Center">
      <AnimatedScreen>
        <TrustCenterScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
