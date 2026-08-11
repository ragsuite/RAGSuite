import React from 'react';

import { SettingsScreen } from '@/features/settings/screens/SettingsScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function SettingsRoute() {
  return (
    <WorkspaceRouteGuard route="settings">
      <AnimatedScreen>
        <SettingsScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
