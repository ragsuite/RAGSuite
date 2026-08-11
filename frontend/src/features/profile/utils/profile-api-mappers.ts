import type {
  TwoFactorStatusResponse,
  UpdatePasswordApiPayload,
  UpdateProfileApiPayload,
  UserProfileResponse,
  UserSessionResponse,
} from '@/features/profile/types/profile.api.types';
import type {
  DepartmentOption,
  ProfileBundle,
  Security,
  UpdatePasswordPayload,
  UpdateProfilePayload,
} from '@/features/profile/types/profile.types';
import { DEPARTMENT_OPTIONS } from '@/features/profile/types/profile.types';

const DEFAULT_DEPARTMENT: DepartmentOption = 'Engineering';
const DEFAULT_TIMEZONE = 'America/Los_Angeles';

function resolveDepartment(value: string | null | undefined): DepartmentOption {
  if (value && DEPARTMENT_OPTIONS.includes(value as DepartmentOption)) {
    return value as DepartmentOption;
  }
  return DEFAULT_DEPARTMENT;
}

function resolveAvatarUrl(avatar: string | null | undefined, username: string): string {
  if (avatar?.trim()) return avatar;
  return `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(username || 'User')}`;
}

export function mapUserProfileToBundle(
  profile: UserProfileResponse,
  security?: Partial<Security>,
): ProfileBundle {
  const username = profile.username?.trim() || 'User';
  return {
    user: {
      id: String(profile.id),
      name: username,
      email: profile.email,
      avatar: resolveAvatarUrl(profile.avatar, username),
      role: profile.is_admin ? 'Admin' : 'User',
      joinedAt: profile.created_at,
    },
    profile: {
      jobTitle: profile.job_title?.trim() || '',
      department: resolveDepartment(profile.department),
      phone: profile.phone_number?.trim() || '',
      location: profile.location?.trim() || '',
      timezone: profile.timezone?.trim() || DEFAULT_TIMEZONE,
      bio: profile.bio?.trim() || '',
    },
    security: {
      twoFactorEnabled: security?.twoFactorEnabled ?? false,
      email2FAEnabled: security?.email2FAEnabled ?? false,
      loginAlerts: profile.login_notifications ?? security?.loginAlerts ?? true,
      hasBackupCodes: security?.hasBackupCodes ?? false,
    },
  };
}

export function mapTwoFactorStatusToSecurity(
  status: TwoFactorStatusResponse,
  loginAlerts: boolean,
): Security {
  return {
    twoFactorEnabled: Boolean(status.is_2fa_enabled),
    email2FAEnabled: Boolean(status.email_2fa_enabled),
    loginAlerts,
    hasBackupCodes: Boolean(status.has_backup_codes),
  };
}

export function mapUpdateProfilePayloadToApi(payload: UpdateProfilePayload): UpdateProfileApiPayload {
  return {
    username: payload.name.trim(),
    job_title: payload.jobTitle.trim() || null,
    department: payload.department,
    phone_number: payload.phone.trim() || null,
    location: payload.location.trim() || null,
    timezone: payload.timezone || null,
    bio: payload.bio.trim() || null,
  };
}

export function mapUpdatePasswordPayloadToApi(payload: UpdatePasswordPayload): UpdatePasswordApiPayload {
  return {
    current_password: payload.currentPassword,
    new_password: payload.newPassword,
    confirm_password: payload.confirmPassword,
  };
}

function readString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function mapRawUserSession(raw: Record<string, unknown>): UserSessionResponse | null {
  const id = readString(raw.id ?? raw.session_id ?? raw.sessionId);
  if (!id) return null;

  const browser = readString(raw.browser_name ?? raw.browser);
  const os = readString(raw.os_name ?? raw.os);
  const deviceFromParts = [browser, os].filter(Boolean).join(' on ');
  const deviceInfo = readString(raw.device_info ?? raw.deviceInfo ?? deviceFromParts) || 'Unknown Browser on Unknown OS';

  const locationRaw = raw.location ?? raw.city;
  const location = locationRaw == null || readString(locationRaw) === '' ? null : readString(locationRaw);

  return {
    id,
    device_info: deviceInfo,
    ip_address: readString(raw.ip_address ?? raw.ipAddress ?? raw.ip),
    location,
    created_at: readString(raw.created_at ?? raw.logged_in_at ?? raw.loggedInAt ?? raw.createdAt),
    last_activity: readString(raw.last_activity ?? raw.last_active_at ?? raw.lastActiveAt ?? raw.lastActivity),
    expires_at: readString(raw.expires_at ?? raw.expiresAt),
    is_current: readBoolean(raw.is_current ?? raw.isCurrent ?? raw.current_session ?? raw.current),
  };
}

function extractSessionArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.sessions)) return record.sessions;
  if (record.data && typeof record.data === 'object') {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.sessions)) return nested.sessions;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

export function mapUserSessionsApiResponse(payload: unknown): UserSessionResponse[] {
  const mapped = extractSessionArray(payload)
    .map((item) => (item && typeof item === 'object' ? mapRawUserSession(item as Record<string, unknown>) : null))
    .filter((session): session is UserSessionResponse => session !== null);

  if (mapped.some((session) => session.is_current)) {
    return mapped;
  }

  if (mapped.length === 0) {
    return mapped;
  }

  const sorted = [...mapped].sort(
    (left, right) => new Date(right.last_activity).getTime() - new Date(left.last_activity).getTime(),
  );

  return sorted.map((session, index) => ({
    ...session,
    is_current: index === 0,
  }));
}
