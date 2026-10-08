export type PublicAuthConfigResponse = {
  registration_enabled: boolean;
  sso_enabled: boolean;
  sso_providers?: string[];
  organization_slug: string | null;
};

export type PublicAuthConfig = {
  registrationEnabled: boolean;
  ssoEnabled: boolean;
  ssoProviders: string[];
  organizationSlug: string | null;
};

export type SsoDiscoverResponse = {
  org_slug?: string | null;
  sso_enabled: boolean;
  provider?: string | null;
  providers?: string[];
};

export type SsoStartResponse = {
  authorize_url: string;
};
