import type { LucideIcon } from 'lucide-react-native';
import { AlertCircle, Ban, Globe, Mail, XCircle } from 'lucide-react-native';
import { Platform } from 'react-native';

const SSO_HASH_STORAGE_KEY = 'ragsuite_sso_callback_hash';
const SSO_PROVIDER_STORAGE_KEY = 'ragsuite_sso_provider';

export type SsoProviderMark = 'google' | 'microsoft';

export function rememberSsoProvider(provider: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }
  const value = provider.trim().toLowerCase();
  if (value === 'google' || value === 'microsoft') {
    sessionStorage.setItem(SSO_PROVIDER_STORAGE_KEY, value);
  }
}

/** Provider for SSO callback UI: query param, then last start click. */
export function resolveSsoCallbackProvider(queryProvider?: string | null): SsoProviderMark {
  const fromQuery = (queryProvider || '').trim().toLowerCase();
  if (fromQuery === 'google' || fromQuery === 'microsoft') {
    return fromQuery;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const stored = (sessionStorage.getItem(SSO_PROVIDER_STORAGE_KEY) || '').trim().toLowerCase();
    if (stored === 'google' || stored === 'microsoft') {
      return stored;
    }
  }
  return 'google';
}

type SsoFailureCode =
  | 'not_provisioned'
  | 'domain_not_allowed'
  | 'email_unverified'
  | 'account_deactivated'
  | 'access_denied'
  | 'sso_failed';

const SSO_FAILURE_UI: Record<
  SsoFailureCode,
  { messageKey: string; subtitleKey: string; icon: LucideIcon }
> = {
  not_provisioned: {
    messageKey: 'login.sso.failedNotProvisioned',
    subtitleKey: 'login.sso.failedNotProvisionedSubtitle',
    icon: XCircle,
  },
  domain_not_allowed: {
    messageKey: 'login.sso.failedDomainNotAllowed',
    subtitleKey: 'login.sso.failedDomainNotAllowedSubtitle',
    icon: Globe,
  },
  email_unverified: {
    messageKey: 'login.sso.failedEmailUnverified',
    subtitleKey: 'login.sso.failedEmailUnverifiedSubtitle',
    icon: Mail,
  },
  account_deactivated: {
    messageKey: 'login.sso.failedAccountDeactivated',
    subtitleKey: 'login.sso.failedAccountDeactivatedSubtitle',
    icon: Ban,
  },
  access_denied: {
    messageKey: 'login.sso.failedAccessDenied',
    subtitleKey: 'login.sso.failedSubtitle',
    icon: Ban,
  },
  sso_failed: {
    messageKey: 'login.sso.failedGeneric',
    subtitleKey: 'login.sso.failedSubtitle',
    icon: AlertCircle,
  },
};

function normalizeSsoFailureCode(error?: string | null): SsoFailureCode {
  const code = (error || '').trim().toLowerCase().replace(/-/g, '_');
  if (code && code in SSO_FAILURE_UI) {
    return code as SsoFailureCode;
  }
  if (code.includes('access_denied') || code.includes('consent_required')) {
    return 'access_denied';
  }
  return 'sso_failed';
}

/** Map backend `/login/callback?error=` codes to i18n message keys. */
export function resolveSsoFailureMessageKey(error?: string | null): string {
  return SSO_FAILURE_UI[normalizeSsoFailureCode(error)].messageKey;
}

/** Icon + subtitle + body message for the SSO callback failure card. */
export function resolveSsoFailureUi(error?: string | null): {
  code: SsoFailureCode;
  messageKey: string;
  subtitleKey: string;
  icon: LucideIcon;
} {
  const code = normalizeSsoFailureCode(error);
  return { code, ...SSO_FAILURE_UI[code] };
}

/** Read OAuth hash params from the current URL (with sessionStorage fallback). */
export function captureSsoCallbackHash(): URLSearchParams {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return new URLSearchParams();
  }

  const href = window.location.href;
  const hashIndex = href.indexOf('#');
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : '';
  if (hash) {
    sessionStorage.setItem(SSO_HASH_STORAGE_KEY, hash);
  }

  const stored = hash || sessionStorage.getItem(SSO_HASH_STORAGE_KEY) || '';
  return new URLSearchParams(stored);
}

export function clearSsoCallbackHash(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(SSO_HASH_STORAGE_KEY);
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', pathname + search);
}

export function isPendingSsoCallback(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }
  const { pathname, search, href } = window.location;
  return (
    pathname.includes('/login/callback') &&
    (search.includes('success=1') || search.includes('success=true') || href.includes('access_token='))
  );
}
