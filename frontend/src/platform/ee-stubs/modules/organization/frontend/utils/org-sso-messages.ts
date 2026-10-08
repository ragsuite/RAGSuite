import { isLikelyI18nKey } from '@/i18n/resolve-error-message';

const TEST_CODE_KEYS: Record<string, string> = {
  credentials_ok: 'org.sso.test.ok',
  invalid_credentials: 'org.sso.test.invalidCredentials',
  missing_client_id: 'org.sso.test.missingClientId',
  missing_client_secret: 'org.sso.test.missingClientSecret',
  missing_tenant_id: 'org.sso.test.missingTenantId',
  not_configured: 'org.sso.test.notConfigured',
  discovery_failed: 'org.sso.test.discoveryFailed',
  jwks_failed: 'org.sso.test.jwksFailed',
  connectivity_failed: 'org.sso.test.connectivityFailed',
};

export function resolveOrgSsoTestMessage(
  t: (key: string) => string,
  message: string,
  code?: string | null,
): string {
  const fromCode = code ? TEST_CODE_KEYS[code.trim().toLowerCase()] : undefined;
  if (fromCode) return t(fromCode);
  if (isLikelyI18nKey(message)) return t(message);
  return message.trim() || t('org.sso.test.connectivityFailed');
}

export function resolveOrgSsoErrorMessage(
  t: (key: string, params?: Record<string, string | number>) => string,
  error: unknown,
): string {
  const raw =
    error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : '';
  if (!raw) return t('org.toast.error');
  if (isLikelyI18nKey(raw)) return t(raw);
  if (/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(raw) && !raw.includes(' ')) {
    return t('org.toast.error');
  }
  return raw;
}
