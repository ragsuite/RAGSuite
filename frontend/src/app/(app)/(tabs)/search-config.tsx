import React from 'react';

import { SearchConfigScreen } from '@/features/search-config/screens/SearchConfigScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function SearchConfigRoute() {
  return (
    <WorkspaceRouteGuard route="search-config">
      <AnimatedScreen>
        <SearchConfigScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
