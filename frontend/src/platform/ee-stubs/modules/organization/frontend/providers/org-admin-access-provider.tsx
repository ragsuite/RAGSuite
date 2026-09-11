import React, { createContext, useContext, useMemo } from "react";

/**
 * CE stub — shape matches EE `OrgAdminAccessProvider` so drawer/palette gating
 * stays edition-correct without attaching RAGSUITE_EE.
 *
 * `enterpriseModulesAvailable: false` means CE stubs are active (locked teasers).
 * Security: this flag is UX-only; API entitlements still gate real EE routes.
 */
type OrgAdminAccessStatus =
  | "idle"
  | "checking"
  | "granted"
  | "forbidden"
  | "error";

type OrgAdminAccessContextValue = {
  status: OrgAdminAccessStatus;
  canAccess: boolean;
  isChecking: boolean;
  errorMessage: string | null;
  /** False in CE stubs; true when real EE frontend packages are attached. */
  enterpriseModulesAvailable: boolean;
  refresh: () => Promise<void>;
};

const CE_ORG_ADMIN_ACCESS: OrgAdminAccessContextValue = {
  status: "idle",
  canAccess: false,
  isChecking: false,
  errorMessage: null,
  enterpriseModulesAvailable: false,
  refresh: async () => undefined,
};

const OrgAdminAccessContext = createContext<OrgAdminAccessContextValue | null>(
  null,
);

export function OrgAdminAccessProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useMemo<OrgAdminAccessContextValue>(
    () => CE_ORG_ADMIN_ACCESS,
    [],
  );
  return (
    <OrgAdminAccessContext.Provider value={value}>
      {children}
    </OrgAdminAccessContext.Provider>
  );
}

export function useOrgAdminAccess() {
  return useContext(OrgAdminAccessContext) ?? CE_ORG_ADMIN_ACCESS;
}

/** Returns null outside OrgAdminAccessProvider (e.g. public embeds). */
export function useOptionalOrgAdminAccess() {
  return useContext(OrgAdminAccessContext);
}
