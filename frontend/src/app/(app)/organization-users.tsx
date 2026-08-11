import { OrganizationScreen } from '@/features/organization/screens/OrganizationScreen';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AnimatedScreen } from '@/shared/components/motion';

export default function OrganizationUsersRoute() {
  return (
    <RouteErrorBoundary pageName="Organization Users">
      <AnimatedScreen>
        <OrganizationScreen panel="users" />
      </AnimatedScreen>
    </RouteErrorBoundary>
  );
}
