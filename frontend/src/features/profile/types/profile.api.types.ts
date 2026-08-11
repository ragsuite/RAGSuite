export type UserProfileResponse = {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login: string | null;
  job_title?: string | null;
  department?: string | null;
  phone_number?: string | null;
  location?: string | null;
  timezone?: string | null;
  bio?: string | null;
  avatar?: string | null;
  login_notifications?: boolean | null;
};

export type UpdateProfileApiPayload = {
  username?: string;
  job_title?: string | null;
  department?: string | null;
  phone_number?: string | null;
  location?: string | null;
  timezone?: string | null;
  bio?: string | null;
  avatar?: string | null;
  login_notifications?: boolean | null;
};

export type UpdatePasswordApiPayload = {
  current_password: string;
  new_password: string;
  confirm_password: string;
};

export type UserSessionResponse = {
  id: string;
  device_info: string;
  ip_address: string;
  location: string | null;
  created_at: string;
  last_activity: string;
  expires_at: string;
  is_current: boolean;
};

export type UserSessionsApiResponse = {
  sessions: UserSessionResponse[];
};

export type RevokeSessionApiResponse = {
  message?: string;
};

export type RevokeAllSessionsApiResponse = {
  message?: string;
  revoked_count?: number;
};

export type TwoFactorStatusResponse = {
  is_2fa_enabled: boolean;
  has_backup_codes: boolean;
  email_2fa_enabled?: boolean;
};

export type TwoFactorSetupResponse = {
  secret: string;
  qr_code_url: string;
  backup_codes: string[];
};

export type BackupCodesResponse = {
  backup_codes: string[];
};
