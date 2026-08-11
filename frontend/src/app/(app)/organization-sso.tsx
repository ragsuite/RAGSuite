import { OrganizationScreen } from '@/features/organization/screens/OrganizationScreen';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function OrganizationSsoRoute() {
  return (
    <RouteErrorBoundary pageName="Organization SSO">
      <OrganizationScreen panel="sso" />
    </RouteErrorBoundary>
  );
}
