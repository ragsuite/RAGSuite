import React from 'react';

import { ProjectsScreen } from '@/features/projects/screens/ProjectsScreen';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function ProjectsRoute() {
  return (
    <RouteErrorBoundary pageName="Projects">
      <AnimatedScreen>
        <ProjectsScreen />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
