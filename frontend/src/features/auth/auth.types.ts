export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  hasCompletedOnboarding: boolean;
};

export type AuthSession = {
  accessToken: string;
  tokenType?: string;
  user: AuthUser;
};

export type SignInPayload = {
  email: string;
  password: string;
  rememberMe?: boolean;
};

export type SignUpPayload = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
};

export type Verify2FAPayload = {
  tempToken: string;
  code: string;
};

export type VerifyEmailPayload = {
  email: string;
  code: string;
};

export type ResendVerificationPayload = {
  email: string;
};

export type SignInResult =
  | { kind: 'session'; session: AuthSession }
  | { kind: 'requires_2fa'; tempToken: string };

export type SignUpResult = {
  kind: 'pending_verification';
  email: string;
  message: string;
  status?: string;
};
