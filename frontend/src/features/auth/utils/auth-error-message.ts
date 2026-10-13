/** Map API / thrown auth errors to i18n keys for the sign-in surfaces. */

export const AUTH_ERROR_KEYS = {
  invalidCredentials: 'login.errors.invalidCredentials',
  accountInactive: 'login.errors.accountInactive',
  emailAlreadyInUse: 'signup.errors.emailAlreadyInUse',
  usernameAlreadyInUse: 'signup.errors.usernameAlreadyInUse',
  invalidVerificationCode: 'verifyEmail.errors.verifyFailed',
  invalid2FACode: 'login.errors.invalid2FACode',
  sessionExpired: 'login.errors.sessionExpired',
  generic: 'login.errors.generic',
} as const;

export type AuthErrorKey = keyof typeof AUTH_ERROR_KEYS;

export function resolveAuthErrorMessage(
  t: (key: string) => string,
  error: unknown,
  fallbackKey: AuthErrorKey,
): string {
  if (error instanceof Error) {
    if (
      error.message === 'errors.network.noResponse' ||
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('econnrefused')
    ) {
      return t('errors.network.unavailable.description');
    }
    if (/user account is inactive/i.test(error.message)) {
      return t(AUTH_ERROR_KEYS.accountInactive);
    }
    if (error.message.includes('.')) {
      return t(error.message);
    }
    const matchedKey = (Object.keys(AUTH_ERROR_KEYS) as AuthErrorKey[]).find(
      (key) => error.message === key || error.message.toLowerCase().includes(key.toLowerCase()),
    );
    if (matchedKey) {
      return t(AUTH_ERROR_KEYS[matchedKey]);
    }
    return error.message;
  }
  return t(AUTH_ERROR_KEYS[fallbackKey]);
}
