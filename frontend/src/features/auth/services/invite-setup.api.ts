import type { AuthSession } from '@/features/auth/auth.types';
import { mapAuthSession } from '@/features/auth/utils/auth-mappers';
import { resolveHasCompletedOnboarding } from '@/features/onboarding/services/onboarding.service';
import { API_CONFIG } from '@/network/apiUrl';
import { setAccessToken } from '@/network/auth-session';
import { get, post } from '@/network/request';

export type InviteSetupPreview = {
  username: string;
  email: string;
  organizationName: string;
  role: string;
  expiresAt: string;
  expired: boolean;
};

type InviteSetupPreviewWire = {
  username: string;
  email: string;
  organization_name: string;
  role: string;
  expires_at: string;
  expired: boolean;
};

type InviteSetupCompleteWire = {
  access_token: string;
  token_type?: string;
  redirect_path?: string;
  user: {
    id: number;
    username: string;
    email: string;
    is_active: boolean;
    is_admin: boolean;
    created_at: string;
    last_login?: string | null;
  };
};

export async function previewInviteSetup(token: string): Promise<InviteSetupPreview> {
  const path = `${API_CONFIG.ORG_INVITE_SETUP}?token=${encodeURIComponent(token)}`;
  const body = (await get<InviteSetupPreviewWire>(path, { skipAuth: true })) as InviteSetupPreviewWire;
  return {
    username: body.username,
    email: body.email,
    organizationName: body.organization_name,
    role: body.role,
    expiresAt: body.expires_at,
    expired: body.expired,
  };
}

export async function completeInviteSetup(input: {
  token: string;
  username: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<AuthSession> {
  const body = (await post(
    API_CONFIG.ORG_INVITE_SETUP,
    {
      token: input.token,
      username: input.username,
      current_password: input.currentPassword,
      new_password: input.newPassword,
      confirm_password: input.confirmPassword,
    },
    { skipAuth: true },
  )) as InviteSetupCompleteWire;

  if (!body.access_token || !body.user) {
    throw new Error('Invalid invite setup response');
  }

  setAccessToken(body.access_token);
  let hasCompletedOnboarding = body.redirect_path !== '/onboarding';
  if (!hasCompletedOnboarding) {
    try {
      hasCompletedOnboarding = await resolveHasCompletedOnboarding();
    } catch {
      hasCompletedOnboarding = true;
    }
  }

  return mapAuthSession(body.access_token, body.user, {
    tokenType: body.token_type ?? 'bearer',
    hasCompletedOnboarding,
  });
}
