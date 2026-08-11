import React from 'react';

import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function ProfileRoute() {
  return (
    <WorkspaceRouteGuard route="profile">
      <RouteErrorBoundary pageName="Profile">
        <AnimatedScreen>
          <ProfileScreen />
        </AnimatedScreen>
      </RouteErrorBoundary>
    </WorkspaceRouteGuard>
  );
}
