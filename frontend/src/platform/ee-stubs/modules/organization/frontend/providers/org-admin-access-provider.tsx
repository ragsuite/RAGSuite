import React, { createContext, useContext, useMemo } from 'react';

/**
 * CE stub — shape matches EE `OrgAdminAccessProvider` so drawer/palette gating
 * stays edition-correct without attaching RAGSUITE_EE.
 *
 * `enterpriseModulesAvailable: false` means CE stubs are active (locked teasers).
 * Security: this flag is UX-only; API entitlements still gate real EE routes.
 */
type OrgAdminAccessStatus = 'idle' | 'checking' | 'granted' | 'forbidden' | 'error';

type OrgAdminAccessContextValue = {
  status: OrgAdminAccessStatus;
  canAccess: boolean;
  isChecking: boolean;
  errorMessage: string | null;
  /** False in CE stubs; true when real EE frontend packages are attached. */
  enterpriseModulesAvailable: boolean;
  refresh: () => Promise<void>;
};

const OrgAdminAccessContext = createContext<OrgAdminAccessContextValue>({
  status: 'idle',
  canAccess: false,
  isChecking: false,
  errorMessage: null,
  enterpriseModulesAvailable: false,
  refresh: async () => undefined,
});

export function OrgAdminAccessProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<OrgAdminAccessContextValue>(
    () => ({
      status: 'idle',
      canAccess: false,
      isChecking: false,
      errorMessage: null,
      enterpriseModulesAvailable: false,
      refresh: async () => undefined,
    }),
    [],
  );
  return <OrgAdminAccessContext.Provider value={value}>{children}</OrgAdminAccessContext.Provider>;
}

export function useOrgAdminAccess() {
  return useContext(OrgAdminAccessContext);
}
