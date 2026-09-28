import type { OrgAdminNavAccess } from '@/config/navigation';
import { useSession } from '@/features/auth/providers/session-provider';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useUserProfileSummary } from '@/features/profile/hooks/useUserProfileSummary';

/** Inputs for `getOrgAdminRouteAccess` / `getDrawerNavSections` (org-admin + EE availability). */
export function useOrgAdminNavAccess(): OrgAdminNavAccess {
  const { session } = useSession();
  const { profile } = useUserProfileSummary();
  const { canAccess, enterpriseModulesAvailable } = useOrgAdminAccess();
  const isOrgAdminUser = Boolean(session?.user.isAdmin) || profile?.user.role === 'Admin';
  return { isOrgAdmin: isOrgAdminUser && canAccess, enterpriseModulesAvailable };
}
