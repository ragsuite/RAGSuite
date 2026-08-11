import * as ImagePicker from 'expo-image-picker';

import {
  handleDisableEmailTwoFactor,
  handleDisableTwoFactor,
  handleEnableEmailTwoFactor,
  handleGetTwoFactorStatus,
  handleGetUserProfile,
  handleGetUserSessions,
  handleRegenerateBackupCodes,
  handleRevokeAllOtherUserSessions,
  handleRevokeUserSession,
  handleSetupTwoFactor,
  handleUpdateUserPassword,
  handleUpdateUserProfile,
  handleVerifyTwoFactor,
} from '@/network/actions/profile.actions';
import {
  mapTwoFactorStatusToSecurity,
  mapUpdatePasswordPayloadToApi,
  mapUpdateProfilePayloadToApi,
  mapUserProfileToBundle,
  mapUserSessionsApiResponse,
} from '@/features/profile/utils/profile-api-mappers';
import type {
  BackupCodesResponse,
  TwoFactorSetupResponse,
  UserSessionResponse,
} from '@/features/profile/types/profile.api.types';
import type {
  ProfileBundle,
  SecurityToggleKey,
  UpdatePasswordPayload,
  UpdateProfilePayload,
} from '@/features/profile/types/profile.types';

async function loadProfileBundle(): Promise<ProfileBundle> {
  const [profile, twoFactorStatus] = await Promise.all([
    handleGetUserProfile(),
    handleGetTwoFactorStatus().catch(() => null),
  ]);
  const bundle = mapUserProfileToBundle(profile);
  if (twoFactorStatus) {
    bundle.security = mapTwoFactorStatusToSecurity(twoFactorStatus, bundle.security.loginAlerts);
  }
  return bundle;
}

export async function fetchProfile(): Promise<ProfileBundle> {
  return loadProfileBundle();
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<ProfileBundle> {
  const updated = await handleUpdateUserProfile(mapUpdateProfilePayloadToApi(payload));
  const twoFactorStatus = await handleGetTwoFactorStatus().catch(() => null);
  const bundle = mapUserProfileToBundle(updated);
  if (twoFactorStatus) {
    bundle.security = mapTwoFactorStatusToSecurity(twoFactorStatus, bundle.security.loginAlerts);
  }
  return bundle;
}

export async function updateProfileAvatar(avatarDataUrl: string): Promise<ProfileBundle> {
  const updated = await handleUpdateUserProfile({ avatar: avatarDataUrl });
  const twoFactorStatus = await handleGetTwoFactorStatus().catch(() => null);
  const bundle = mapUserProfileToBundle(updated);
  if (twoFactorStatus) {
    bundle.security = mapTwoFactorStatusToSecurity(twoFactorStatus, bundle.security.loginAlerts);
  }
  return bundle;
}

export async function updatePassword(payload: UpdatePasswordPayload): Promise<{ success: true }> {
  await handleUpdateUserPassword(mapUpdatePasswordPayloadToApi(payload));
  return { success: true };
}

export async function toggleSecuritySetting(key: SecurityToggleKey, value: boolean): Promise<ProfileBundle> {
  if (key === 'loginAlerts') {
    const updated = await handleUpdateUserProfile({ login_notifications: value });
    const twoFactorStatus = await handleGetTwoFactorStatus().catch(() => null);
    const bundle = mapUserProfileToBundle(updated);
    if (twoFactorStatus) {
      bundle.security = mapTwoFactorStatusToSecurity(twoFactorStatus, value);
    } else {
      bundle.security.loginAlerts = value;
    }
    return bundle;
  }
  throw new Error('Use dedicated 2FA actions for authenticator and email security.');
}

export async function pickAndUploadAvatar(): Promise<ProfileBundle> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to update your avatar.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    base64: true,
  });

  if (result.canceled || !result.assets[0]?.base64) {
    throw new Error('Avatar upload cancelled.');
  }

  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
    throw new Error('profile.toast.fileTooLarge.description');
  }

  const mime = asset.mimeType ?? 'image/jpeg';
  if (!mime.startsWith('image/')) {
    throw new Error('profile.toast.invalidFileType.description');
  }

  const dataUrl = `data:${mime};base64,${asset.base64}`;
  return updateProfileAvatar(dataUrl);
}

export async function fetchUserSessions(): Promise<UserSessionResponse[]> {
  const response = await handleGetUserSessions();
  return mapUserSessionsApiResponse(response);
}

export async function revokeUserSession(sessionId: string): Promise<void> {
  await handleRevokeUserSession(sessionId);
}

export async function revokeAllOtherUserSessions(): Promise<void> {
  await handleRevokeAllOtherUserSessions();
}

export async function setupTwoFactor(): Promise<TwoFactorSetupResponse> {
  return handleSetupTwoFactor();
}

export async function verifyTwoFactor(code: string): Promise<ProfileBundle> {
  const status = await handleVerifyTwoFactor(code);
  const profile = await handleGetUserProfile();
  const bundle = mapUserProfileToBundle(profile);
  bundle.security = mapTwoFactorStatusToSecurity(status, bundle.security.loginAlerts);
  return bundle;
}

export async function disableTwoFactor(password: string, code?: string): Promise<ProfileBundle> {
  const status = await handleDisableTwoFactor(password, code);
  const profile = await handleGetUserProfile();
  const bundle = mapUserProfileToBundle(profile);
  bundle.security = mapTwoFactorStatusToSecurity(status, bundle.security.loginAlerts);
  return bundle;
}

export async function regenerateBackupCodes(): Promise<BackupCodesResponse> {
  return handleRegenerateBackupCodes();
}

export async function enableEmailTwoFactor(password: string): Promise<ProfileBundle> {
  const status = await handleEnableEmailTwoFactor(password);
  const profile = await handleGetUserProfile();
  const bundle = mapUserProfileToBundle(profile);
  bundle.security = mapTwoFactorStatusToSecurity(status, bundle.security.loginAlerts);
  return bundle;
}

export async function disableEmailTwoFactor(password: string): Promise<ProfileBundle> {
  const status = await handleDisableEmailTwoFactor(password);
  const profile = await handleGetUserProfile();
  const bundle = mapUserProfileToBundle(profile);
  bundle.security = mapTwoFactorStatusToSecurity(status, bundle.security.loginAlerts);
  return bundle;
}
