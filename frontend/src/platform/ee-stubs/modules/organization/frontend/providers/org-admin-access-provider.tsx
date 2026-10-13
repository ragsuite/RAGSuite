import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/features/auth/providers/session-provider';
import {
  handleGetOrgTeamCapabilities,
  handleListOrgUsers,
} from '@/features/organization/services/organization.service';

type OrgAdminAccessStatus = 'idle' | 'checking' | 'granted' | 'forbidden' | 'error';

type OrgAdminAccessContextValue = {
  status: OrgAdminAccessStatus;
  canAccess: boolean;
  isChecking: boolean;
  errorMessage: string | null;
  /** False when CE stubs are active (SSO / org settings stay locked teasers). */
  enterpriseModulesAvailable: boolean;
  /** True when organization entitlement allows Member access level. */
  memberRoleAvailable: boolean;
  refresh: () => Promise<void>;
};

const OrgAdminAccessContext = createContext<OrgAdminAccessContextValue | null>(null);

type Props = { children: React.ReactNode };

/**
 * CE Team Members unlock — probe list users (platform API, no EE entitlement).
 * `enterpriseModulesAvailable` stays false so SSO / org settings remain locked teasers.
 */
export function OrgAdminAccessProvider({ children }: Props) {
  const { session, isAuthenticated } = useSession();
  const isAdmin = Boolean(session?.user.isAdmin);
  const [status, setStatus] = useState<OrgAdminAccessStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memberRoleAvailable, setMemberRoleAvailable] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !isAdmin) {
      setStatus('idle');
      setErrorMessage(null);
      setMemberRoleAvailable(false);
      return;
    }

    setStatus('checking');
    setErrorMessage(null);

    try {
      const [capabilities] = await Promise.all([
        handleGetOrgTeamCapabilities().catch(() => ({ memberRole: false })),
        handleListOrgUsers({ limit: 1 }),
      ]);
      setMemberRoleAvailable(Boolean(capabilities.memberRole));
      setStatus('granted');
    } catch (error) {
      const statusCode = (error as { status?: number })?.status;
      if (statusCode === 403) {
        setStatus('forbidden');
        setMemberRoleAvailable(false);
        return;
      }
      setStatus('error');
      setMemberRoleAvailable(false);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown organization access error');
    }
  }, [isAdmin, isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh, session?.accessToken]);

  const value = useMemo<OrgAdminAccessContextValue>(
    () => ({
      status,
      canAccess: isAdmin && status !== 'forbidden',
      isChecking: status === 'checking',
      errorMessage,
      enterpriseModulesAvailable: false,
      memberRoleAvailable,
      refresh,
    }),
    [errorMessage, isAdmin, memberRoleAvailable, refresh, status],
  );

  return <OrgAdminAccessContext.Provider value={value}>{children}</OrgAdminAccessContext.Provider>;
}

export function useOrgAdminAccess() {
  const context = useContext(OrgAdminAccessContext);
  if (!context) {
    throw new Error('useOrgAdminAccess must be used inside OrgAdminAccessProvider');
  }
  return context;
}

/** Returns null outside OrgAdminAccessProvider (e.g. public embeds). */
export function useOptionalOrgAdminAccess() {
  return useContext(OrgAdminAccessContext);
}
