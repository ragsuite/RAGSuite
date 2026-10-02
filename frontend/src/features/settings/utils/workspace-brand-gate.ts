import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';

export type WorkspaceBrandFields = {
  orgName: string;
  logoDataUrl: string | null;
};

/**
 * Whether the deployment may customize workspace logo + organization name (EE).
 * Pass `enterpriseModulesAvailable` from `useOrgAdminAccess()` on the client.
 */
export function canCustomizeWorkspaceBrand(enterpriseModulesAvailable: boolean): boolean {
  return Boolean(enterpriseModulesAvailable);
}

/** Force CE RAGSuite name + null logo; keep EE values (empty name → RAGSuite). */
export function applyEffectiveWorkspaceBranding(
  branding: WorkspaceBrandFields,
  enterpriseModulesAvailable: boolean,
): WorkspaceBrandFields {
  if (!canCustomizeWorkspaceBrand(enterpriseModulesAvailable)) {
    return {
      orgName: BRANDING_DEFAULTS.orgName,
      logoDataUrl: null,
    };
  }
  const trimmed = (branding.orgName || '').trim();
  return {
    orgName: trimmed || BRANDING_DEFAULTS.orgName,
    logoDataUrl: branding.logoDataUrl?.trim() ? branding.logoDataUrl : null,
  };
}
