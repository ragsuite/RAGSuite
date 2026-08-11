import { useCallback, useEffect, useRef, useState } from 'react';

import {
  disableEmailTwoFactor,
  disableTwoFactor,
  enableEmailTwoFactor,
  fetchProfile,
  fetchUserSessions,
  pickAndUploadAvatar,
  regenerateBackupCodes,
  revokeAllOtherUserSessions,
  revokeUserSession,
  setupTwoFactor,
  toggleSecuritySetting,
  updatePassword,
  updateProfile,
  verifyTwoFactor,
} from '@/features/profile/services/profile.service';
import type {
  BackupCodesResponse,
  TwoFactorSetupResponse,
  UserSessionResponse,
} from '@/features/profile/types/profile.api.types';
import type {
  PasswordFormValues,
  ProfileBundle,
  ProfileFormValues,
  SecurityToggleKey,
  UpdateProfilePayload,
} from '@/features/profile/types/profile.types';
import { useTranslation } from '@/i18n';

type Feedback = {
  type: 'success' | 'error';
  message: string;
} | null;

type ProfileState = {
  data: ProfileBundle | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

function resolveErrorMessage(t: (key: string) => string, error: unknown, fallbackKey: string): string {
  if (error instanceof Error) {
    if (error.message.includes('.')) {
      return t(error.message);
    }
    return error.message;
  }
  return t(fallbackKey);
}

export function useProfile() {
  const { t } = useTranslation();
  const [state, setState] = useState<ProfileState>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [togglingMap, setTogglingMap] = useState<Record<SecurityToggleKey, boolean>>({
    twoFactorEnabled: false,
    email2FAEnabled: false,
    loginAlerts: false,
  });
  const toggleLocksRef = useRef<Record<SecurityToggleKey, boolean>>({
    twoFactorEnabled: false,
    email2FAEnabled: false,
    loginAlerts: false,
  });

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    setState((prev) => ({
      ...prev,
      loading: mode === 'initial' && prev.data == null,
      refreshing: mode === 'refresh' || (mode === 'initial' && prev.data != null),
      error: null,
    }));

    try {
      const data = await fetchProfile();
      setState({
        data,
        loading: false,
        refreshing: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: resolveErrorMessage(t, error, 'profile.errors.loadFailed'),
      }));
    }
  }, [t]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const saveProfile = useCallback(async (values: ProfileFormValues) => {
    if (!state.data) return false;
    setSavingProfile(true);
    setFeedback(null);
    try {
      const payload: UpdateProfilePayload = {
        name: values.name,
        jobTitle: values.jobTitle,
        department: values.department,
        phone: values.phone,
        location: values.location,
        timezone: values.timezone,
        bio: values.bio,
      };
      const updated = await updateProfile(payload);
      setState((prev) => ({ ...prev, data: updated }));
      setFeedback({ type: 'success', message: t('profile.toast.updateSuccess.description') });
      return true;
    } catch (error) {
      setFeedback({
        type: 'error',
        message: resolveErrorMessage(t, error, 'profile.toast.updateFailed'),
      });
      return false;
    } finally {
      setSavingProfile(false);
    }
  }, [state.data, t]);

  const submitPassword = useCallback(async (values: PasswordFormValues) => {
    setUpdatingPassword(true);
    setFeedback(null);
    try {
      await updatePassword(values);
      setFeedback({ type: 'success', message: t('profile.toast.passwordUpdated.description') });
      return true;
    } catch (error) {
      setFeedback({
        type: 'error',
        message: resolveErrorMessage(t, error, 'profile.toast.passwordUpdateFailed'),
      });
      return false;
    } finally {
      setUpdatingPassword(false);
    }
  }, [t]);

  const onToggleSecurity = useCallback(async (key: SecurityToggleKey, value: boolean) => {
    if (!state.data) return;
    if (key !== 'loginAlerts') return;
    if (toggleLocksRef.current[key]) return;
    toggleLocksRef.current[key] = true;
    setTogglingMap((prev) => ({ ...prev, [key]: true }));
    setFeedback(null);
    try {
      const updated = await toggleSecuritySetting(key, value);
      setState((prev) => ({ ...prev, data: updated }));
    } catch (error) {
      setFeedback({
        type: 'error',
        message: resolveErrorMessage(t, error, 'profile.errors.securityActionFailed'),
      });
    } finally {
      toggleLocksRef.current[key] = false;
      setTogglingMap((prev) => ({ ...prev, [key]: false }));
    }
  }, [state.data, t]);

  const onUploadAvatar = useCallback(async () => {
    if (!state.data) return;
    setUploadingAvatar(true);
    setFeedback(null);
    try {
      const updated = await pickAndUploadAvatar();
      setState((prev) => ({ ...prev, data: updated }));
      setFeedback({ type: 'success', message: t('profile.toast.avatarUpdated') });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Avatar upload cancelled.') {
        return;
      }
      setFeedback({
        type: 'error',
        message: message.includes('.') ? t(message) : message || t('profile.errors.securityActionFailed'),
      });
    } finally {
      setUploadingAvatar(false);
    }
  }, [state.data, t]);

  const runSecurityAction = useCallback(
    async <T,>(action: () => Promise<T>, successMessage: string): Promise<T | null> => {
      setSecurityBusy(true);
      setFeedback(null);
      try {
        const result = await action();
        setFeedback({ type: 'success', message: successMessage });
        return result;
      } catch (error) {
        setFeedback({
          type: 'error',
          message: resolveErrorMessage(t, error, 'profile.errors.securityActionFailed'),
        });
        return null;
      } finally {
        setSecurityBusy(false);
      }
    },
    [t],
  );

  const beginTwoFactorSetup = useCallback(async (): Promise<TwoFactorSetupResponse | null> => {
    return runSecurityAction(() => setupTwoFactor(), t('profile.toast.2fa.setupStarted.description'));
  }, [runSecurityAction, t]);

  const completeTwoFactorSetup = useCallback(
    async (code: string) => {
      const updated = await runSecurityAction(
        () => verifyTwoFactor(code),
        t('profile.toast.2fa.enabled.description'),
      );
      if (updated) setState((prev) => ({ ...prev, data: updated }));
      return Boolean(updated);
    },
    [runSecurityAction, t],
  );

  const removeTwoFactor = useCallback(
    async (password: string, code: string) => {
      if (!code || code.length !== 6) {
        setFeedback({ type: 'error', message: t('profile.toast.invalidCode.description') });
        return false;
      }
      const updated = await runSecurityAction(
        () => disableTwoFactor(password, code),
        t('profile.toast.2fa.disabled.description'),
      );
      if (updated) setState((prev) => ({ ...prev, data: updated }));
      return Boolean(updated);
    },
    [runSecurityAction, t],
  );

  const refreshBackupCodes = useCallback(async (): Promise<BackupCodesResponse | null> => {
    return runSecurityAction(
      () => regenerateBackupCodes(),
      t('profile.toast.backupCodes.description'),
    );
  }, [runSecurityAction, t]);

  const enableEmail2FA = useCallback(
    async (password: string) => {
      const updated = await runSecurityAction(
        () => enableEmailTwoFactor(password),
        t('profile.toast.email2fa.enabled.description'),
      );
      if (updated) setState((prev) => ({ ...prev, data: updated }));
      return Boolean(updated);
    },
    [runSecurityAction, t],
  );

  const disableEmail2FA = useCallback(
    async (password: string) => {
      const updated = await runSecurityAction(
        () => disableEmailTwoFactor(password),
        t('profile.toast.email2fa.disabled.description'),
      );
      if (updated) setState((prev) => ({ ...prev, data: updated }));
      return Boolean(updated);
    },
    [runSecurityAction, t],
  );

  const loadSessions = useCallback(async (): Promise<UserSessionResponse[]> => {
    return fetchUserSessions();
  }, []);

  const revokeSession = useCallback(async (sessionId: string) => {
    await runSecurityAction(() => revokeUserSession(sessionId), t('profile.toast.sessions.revoked'));
  }, [runSecurityAction, t]);

  const revokeOtherSessions = useCallback(async () => {
    await runSecurityAction(() => revokeAllOtherUserSessions(), t('profile.toast.sessions.revokedOthers'));
  }, [runSecurityAction, t]);

  return {
    data: state.data,
    loading: state.loading,
    refreshing: state.refreshing,
    error: state.error,
    savingProfile,
    updatingPassword,
    uploadingAvatar,
    securityBusy,
    togglingMap,
    feedback,
    clearFeedback,
    fetchProfile: () => load('initial'),
    refresh: () => load('refresh'),
    updateProfile: saveProfile,
    updatePassword: submitPassword,
    toggleSecuritySettings: onToggleSecurity,
    uploadAvatar: onUploadAvatar,
    beginTwoFactorSetup,
    completeTwoFactorSetup,
    removeTwoFactor,
    refreshBackupCodes,
    enableEmail2FA,
    disableEmail2FA,
    loadSessions,
    revokeSession,
    revokeOtherSessions,
  };
}
