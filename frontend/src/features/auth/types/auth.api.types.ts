export type UserResponse = {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login?: string | null;
};

export type UserLoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  requires_2fa: boolean;
  temp_token?: string | null;
  access_token?: string | null;
  token_type?: string | null;
  user?: UserResponse | null;
};

export type Login2FARequest = {
  temp_token: string;
  code: string;
};

export type Login2FAResponse = {
  access_token: string;
  token_type?: string;
  user: UserResponse;
};

export type Login2FAResendRequest = {
  temp_token: string;
};

export type Login2FAResendResponse = {
  message: string;
  expires_in_minutes: number;
};

export type UserCreateRequest = {
  username: string;
  email: string;
  password: string;
};

export type RegistrationPendingResponse = {
  status?: string;
  message?: string;
  email: string;
  email_verified?: boolean;
};

export type VerifyEmailRequest = {
  email: string;
  code: string;
};

export type VerifyEmailResponse = {
  status?: string;
  message?: string;
  access_token?: string | null;
  token_type?: string | null;
  user?: UserResponse | null;
  redirect_to?: string;
};

export type ResendVerificationRequest = {
  email: string;
};

export type ResendVerificationResponse = {
  message?: string;
};
