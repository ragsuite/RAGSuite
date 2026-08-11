export type PublicAuthConfigResponse = {
  registration_enabled: boolean;
  sso_enabled: boolean;
  organization_slug: string | null;
};

export type PublicAuthConfig = {
  registrationEnabled: boolean;
  ssoEnabled: boolean;
  organizationSlug: string | null;
};

export type SsoDiscoverResponse = {
  org_slug?: string | null;
  sso_enabled: boolean;
  provider?: string | null;
};

export type SsoStartResponse = {
  authorize_url: string;
};
