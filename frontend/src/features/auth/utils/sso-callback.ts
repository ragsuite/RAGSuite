import { Platform } from 'react-native';

const SSO_HASH_STORAGE_KEY = 'ragsuite_sso_callback_hash';

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
