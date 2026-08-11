import React from 'react';

import { NotificationScreen } from '@/modules/notifications';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function NotificationsScreen() {
  return (
    <RouteErrorBoundary pageName="Notifications">
      <AnimatedScreen>
        <NotificationScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
