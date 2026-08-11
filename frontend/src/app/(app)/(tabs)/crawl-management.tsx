import React, { useState } from 'react';

import { CrawlManagementScreen } from '@/features/crawl/screens/CrawlManagementScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';
import { PageErrorBoundary } from '@/shared/components/page-error-boundary';

export default function CrawlManagementRoute() {
  const [remountKey, setRemountKey] = useState(0);

  return (
    <WorkspaceRouteGuard route="crawl-management">
      <AnimatedScreen>
        <PageErrorBoundary key={remountKey} onRetry={() => setRemountKey((key) => key + 1)}>
          <CrawlManagementScreen />
        </PageErrorBoundary>
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
