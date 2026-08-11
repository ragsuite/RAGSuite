import { Redirect } from 'expo-router';
import React from 'react';

import { hrefForAppRoute } from '@/config/navigation';
import { useSession } from '@/features/auth/providers/session-provider';
import { AnalyticsScreen } from '@/features/analytics/screens/analytics-screen';
import { firstAccessibleTabRoute } from '@/features/organization/utils/workspace-permissions';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function HomeRoute() {
  const { session } = useSession();
  const { canAccessRoute, loading } = useActiveProject();

  if (session && !session.user.hasCompletedOnboarding) {
    return <Redirect href="/(app)/onboarding" />;
  }

  if (!loading && !canAccessRoute('index')) {
    const fallback = firstAccessibleTabRoute(canAccessRoute);
    if (fallback && fallback !== 'index') {
      return <Redirect href={hrefForAppRoute(fallback)} />;
    }
  }

  return (
    <WorkspaceRouteGuard route="index">
      <AnimatedScreen>
        <AnalyticsScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
