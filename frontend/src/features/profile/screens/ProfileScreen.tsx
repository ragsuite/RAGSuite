import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';

import { ContactLocationForm } from '@/features/profile/components/ContactLocationForm';
import { PasswordForm } from '@/features/profile/components/PasswordForm';
import { PersonalInfoForm } from '@/features/profile/components/PersonalInfoForm';
import { ProfileHeader } from '@/features/profile/components/ProfileHeader';
import { ProfileSecuritySheet } from '@/features/profile/components/ProfileSecuritySheet';
import { ProfileTabs } from '@/features/profile/components/ProfileTabs';
import { SecuritySettings } from '@/features/profile/components/SecuritySettings';
import { SessionManagementSheet } from '@/features/profile/components/SessionManagementSheet';
import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { useProfile } from '@/features/profile/hooks/useProfile';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import type { TwoFactorSetupResponse } from '@/features/profile/types/profile.api.types';
import {
  passwordFormSchema,
  createProfileFormSchema,
  type PasswordFormValues,
  type ProfileFormValues,
  type ProfileTabKey,
} from '@/features/profile/types/profile.types';
import { useTranslation } from '@/i18n';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export function ProfileScreen() {
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const copy = useProfileCopy();
  const { t } = useTranslation();
  const profileFormSchema = useMemo(() => createProfileFormSchema(t), [t]);
  const isWeb = Platform.OS === 'web';
  const { width, contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const isWebNarrow = isWeb && width < 980;
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('general');
  const { hasPermission } = useActiveProject();
  const canViewSecurity = hasPermission('profile:security');
  const canViewGeneral = hasPermission('profile:general');

  useEffect(() => {
    if (activeTab === 'security' && !canViewSecurity && canViewGeneral) {
      setActiveTab('general');
    }
    if (activeTab === 'general' && !canViewGeneral && canViewSecurity) {
      setActiveTab('security');
    }
  }, [activeTab, canViewGeneral, canViewSecurity]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [securitySheetMode, setSecuritySheetMode] = useState<
    'setup' | 'verify' | 'disable-totp' | 'email-password' | 'backup-codes' | null
  >(null);
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [email2FAEnableMode, setEmail2FAEnableMode] = useState(true);

  const {
    data,
    loading,
    refreshing,
    error,
    savingProfile,
    updatingPassword,
    uploadingAvatar,
    securityBusy,
    feedback,
    clearFeedback,
    refresh,
    fetchProfile,
    updateProfile,
    updatePassword,
    toggleSecuritySettings,
    uploadAvatar,
    beginTwoFactorSetup,
    completeTwoFactorSetup,
    removeTwoFactor,
    refreshBackupCodes,
    enableEmail2FA,
    disableEmail2FA,
    loadSessions,
    revokeSession,
    revokeOtherSessions,
  } = useProfile();

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      name: '',
      email: '',
      jobTitle: '',
      department: 'Engineering',
      phone: '',
      location: '',
      timezone: 'America/Los_Angeles',
      bio: '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!data) return;
    profileForm.reset({
      name: data.user.name,
      email: data.user.email,
      jobTitle: data.profile.jobTitle,
      department: data.profile.department,
      phone: data.profile.phone,
      location: data.profile.location,
      timezone: data.profile.timezone,
      bio: data.profile.bio,
    });
  }, [data, profileForm]);

  const profileValues = profileForm.watch();
  const passwordValues = passwordForm.watch();

  const saveProfile = profileForm.handleSubmit(async (values) => {
    await updateProfile(values);
  });

  const submitPassword = passwordForm.handleSubmit(async (values) => {
    const ok = await updatePassword(values);
    if (ok) {
      passwordForm.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }
  });

  return (
    <AppKeyboardScreenScroll
      rootStyle={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          width: '100%',
          gap: spacing.lg,
          paddingHorizontal: isWeb ? (horizontalPadding ?? spacing.sm) : spacing.sm,
          paddingTop: isWeb ? spacing.md : spacing.sm,
          paddingBottom: scrollBottomPadding,
          ...(isWeb ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const } : null),
        },
      ]}
      refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refresh} />}>
      {isWeb ? (
        <PageSectionHeader title={copy.title} subtitle={copy.subtitle} />
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={[typography.pageDisplay, { color: colors.text }]}>{copy.title}</Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>{copy.subtitle}</Text>
        </View>
      )}

      <StatePanel loading={loading} error={error} onRetry={fetchProfile}>
        {data ? (
          <>
            <ProfileHeader
              name={profileValues.name || data.user.name}
              role={data.user.role}
              email={profileValues.email || data.user.email}
              jobTitle={profileValues.jobTitle || data.profile.jobTitle}
              department={profileValues.department || data.profile.department}
              location={profileValues.location || data.profile.location}
              joinedAt={data.user.joinedAt}
              avatar={data.user.avatar}
              saving={savingProfile || uploadingAvatar}
              onAvatarPress={() => void uploadAvatar()}
              onSave={saveProfile}
              compact={isWebNarrow}
            />

            <ProfileTabs
              activeTab={activeTab}
              compact={isWebNarrow}
              showGeneral={canViewGeneral}
              showSecurity={canViewSecurity}
              onChange={(tab) => {
                clearFeedback();
                setActiveTab(tab);
              }}
            />

            {activeTab === 'general' && canViewGeneral ? (
              <View style={[styles.grid, { gap: spacing.md, flexDirection: isWebNarrow ? 'column' : 'row' }]}>
                <View style={styles.col}>
                  <PersonalInfoForm
                    name={profileValues.name}
                    email={profileValues.email}
                    jobTitle={profileValues.jobTitle}
                    department={profileValues.department}
                    onChange={(key, next) => {
                      clearFeedback();
                      if (key === 'name' || key === 'jobTitle') {
                        profileForm.setValue(key, next, { shouldDirty: true, shouldValidate: true });
                        return;
                      }
                      profileForm.setValue('department', next, { shouldDirty: true, shouldValidate: true });
                    }}
                    errors={{
                      name: profileForm.formState.errors.name?.message,
                      email: profileForm.formState.errors.email?.message,
                      jobTitle: profileForm.formState.errors.jobTitle?.message,
                      department: profileForm.formState.errors.department?.message,
                    }}
                  />
                </View>
                <View style={styles.col}>
                  <ContactLocationForm
                    phone={profileValues.phone}
                    location={profileValues.location}
                    timezone={profileValues.timezone}
                    bio={profileValues.bio}
                    onChange={(key, next) => {
                      clearFeedback();
                      if (key === 'phone' || key === 'location' || key === 'bio') {
                        profileForm.setValue(key, next, { shouldDirty: true, shouldValidate: true });
                        return;
                      }
                      profileForm.setValue('timezone', next, { shouldDirty: true, shouldValidate: true });
                    }}
                    errors={{
                      phone: profileForm.formState.errors.phone?.message,
                      location: profileForm.formState.errors.location?.message,
                      timezone: profileForm.formState.errors.timezone?.message,
                      bio: profileForm.formState.errors.bio?.message,
                    }}
                  />
                </View>
              </View>
            ) : activeTab === 'security' && canViewSecurity ? (
              <View style={[styles.grid, { gap: spacing.md, flexDirection: isWebNarrow ? 'column' : 'row' }]}>
                <View style={styles.col}>
                  <PasswordForm
                    currentPassword={passwordValues.currentPassword}
                    newPassword={passwordValues.newPassword}
                    confirmPassword={passwordValues.confirmPassword}
                    onChange={(key, value) => {
                      clearFeedback();
                      if (key === 'currentPassword') {
                        passwordForm.setValue('currentPassword', value, { shouldDirty: true, shouldValidate: true });
                        return;
                      }
                      if (key === 'newPassword') {
                        passwordForm.setValue('newPassword', value, { shouldDirty: true, shouldValidate: true });
                        return;
                      }
                      passwordForm.setValue('confirmPassword', value, { shouldDirty: true, shouldValidate: true });
                    }}
                    errors={{
                      currentPassword: passwordForm.formState.errors.currentPassword?.message,
                      newPassword: passwordForm.formState.errors.newPassword?.message,
                      confirmPassword: passwordForm.formState.errors.confirmPassword?.message,
                    }}
                    loading={updatingPassword}
                    disabled={updatingPassword}
                    onSubmit={submitPassword}
                  />
                </View>
                <View style={styles.col}>
                  <SecuritySettings
                    security={data.security}
                    securityBusy={securityBusy}
                    onToggleLoginAlerts={(value) => void toggleSecuritySettings('loginAlerts', value)}
                    onEnableTotp={() => {
                      void (async () => {
                        const setup = await beginTwoFactorSetup();
                        if (!setup) return;
                        setSetupData(setup);
                        setBackupCodes(setup.backup_codes ?? []);
                        setSecuritySheetMode('setup');
                      })();
                    }}
                    onDisableTotp={() => setSecuritySheetMode('disable-totp')}
                    onRegenerateBackupCodes={() => {
                      void (async () => {
                        const response = await refreshBackupCodes();
                        if (!response) return;
                        setBackupCodes(response.backup_codes ?? []);
                        setSecuritySheetMode('backup-codes');
                      })();
                    }}
                    onEmail2FAPress={() => {
                      setEmail2FAEnableMode(!data.security.email2FAEnabled);
                      setSecuritySheetMode('email-password');
                    }}
                    onSessionsPress={() => setSessionsOpen(true)}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <FormErrorBanner message={t('profile.errors.loadFailed')} />
        )}

      </StatePanel>

      <SessionManagementSheet
        visible={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        loadSessions={loadSessions}
        onRevokeSession={revokeSession}
        onRevokeOthers={revokeOtherSessions}
      />

      <ProfileSecuritySheet
        mode={securitySheetMode}
        setupData={setupData}
        backupCodes={backupCodes}
        busy={securityBusy}
        emailEnable={email2FAEnableMode}
        onClose={() => setSecuritySheetMode(null)}
        onProceedToVerify={() => setSecuritySheetMode('verify')}
        onVerifyCode={(code) => {
          void (async () => {
            const ok = await completeTwoFactorSetup(code);
            if (ok) {
              setSecuritySheetMode(null);
              setSetupData(null);
            }
          })();
        }}
        onDisableTotp={(password, code) => {
          void (async () => {
            const ok = await removeTwoFactor(password, code);
            if (ok) setSecuritySheetMode(null);
          })();
        }}
        onEmailPassword={(password) => {
          void (async () => {
            const ok = email2FAEnableMode ? await enableEmail2FA(password) : await disableEmail2FA(password);
            if (ok) setSecuritySheetMode(null);
          })();
        }}
      />
      <ToastFeedbackBridge feedback={feedback} onDismiss={clearFeedback} />
    </AppKeyboardScreenScroll>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {},
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  col: { flex: 1, minWidth: Platform.OS === 'web' ? 340 : 300 },
});
