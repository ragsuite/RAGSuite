import { Redirect, useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { hrefForAppRoute, type AppRouteName } from '@/config/navigation';
import { firstAccessibleTabRoute } from '@/features/organization/utils/workspace-permissions';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';

type Props = {
  route: AppRouteName;
  children: React.ReactNode;
};

/** Redirects away when the signed-in member lacks permission for this workspace route. */
export function WorkspaceRouteGuard({ route, children }: Props) {
  const router = useRouter();
  const { canAccessRoute, loading } = useActiveProject();
  const allowed = canAccessRoute(route);
  const fallbackRoute = firstAccessibleTabRoute(canAccessRoute);

  useEffect(() => {
    if (loading || allowed) return;
    if (fallbackRoute) {
      router.replace(hrefForAppRoute(fallbackRoute as AppRouteName));
    }
  }, [allowed, fallbackRoute, loading, router]);

  if (loading) {
    return null;
  }

  if (!allowed) {
    if (fallbackRoute) {
      return <Redirect href={hrefForAppRoute(fallbackRoute as AppRouteName)} />;
    }
    return null;
  }

  return <>{children}</>;
}
