export const AUTH_STORAGE_KEY = 'ragsuite.auth.session';

/** Marker for Expo web SSO sessions that rely on the httpOnly access_token cookie. */
export const COOKIE_SESSION_TOKEN = 'cookie' as const;

export const AUTH_ERROR_MESSAGES = {
  invalidCredentials: 'Invalid username or password.',
  emailAlreadyInUse: 'This email is already registered.',
  usernameAlreadyInUse: 'This username is already taken.',
  invalidVerificationCode: 'Invalid or expired verification code.',
  invalid2FACode: 'Invalid or expired 2FA code.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  generic: 'Something went wrong. Please try again.',
} as const;
