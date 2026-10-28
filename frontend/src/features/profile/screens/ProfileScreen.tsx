import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';

import { ContactLocationForm } from '@/features/profile/components/ContactLocationForm';
import { PersonalInfoForm } from '@/features/profile/components/PersonalInfoForm';
import { ProfileHeader } from '@/features/profile/components/ProfileHeader';
import { ProfilePasswordSheet } from '@/features/profile/components/ProfilePasswordSheet';
import { ProfileSectionCard } from '@/features/profile/components/ProfileSectionCard';
import { ProfileSecuritySheet } from '@/features/profile/components/ProfileSecuritySheet';
import { ProfileTabs } from '@/features/profile/components/ProfileTabs';
import { SecuritySettings } from '@/features/profile/components/SecuritySettings';
import { SessionManagementSheet } from '@/features/profile/components/SessionManagementSheet';
import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { useProfile } from '@/features/profile/hooks/useProfile';
import type { TwoFactorSetupResponse } from '@/features/profile/types/profile.api.types';
import {
  passwordFormSchema,
  createProfileFormSchema,
  type PasswordFormValues,
  type ProfileFormValues,
  type ProfileTabKey,
} from '@/features/profile/types/profile.types';
import { useModuleAccess } from '@/features/organization/hooks/use-module-access';
import { useTranslation } from '@/i18n';
import { Save, Shield, UserRound } from 'lucide-react-native';
import { AppButton } from '@/shared/components/app-button';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { ModuleWriteProvider } from '@/features/organization/hooks/use-module-write';
import { ViewOnlyBadge } from '@/shared/components/read-only-permission-banner';
import { PageSectionHeader } from '@/shared/components/surfaces';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export function ProfileScreen() {
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const copy = useProfileCopy();
  const { t } = useTranslation();
  const profileFormSchema = useMemo(() => createProfileFormSchema(t), [t]);
  const isWeb = Platform.OS === 'web';
  const { contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const isCompact = useCompactLayout();
  const { canWrite } = useModuleAccess('profile');
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('general');
  const canViewSecurity = true;
  const canViewGeneral = true;

  useEffect(() => {
    if (activeTab === 'security' && !canViewSecurity && canViewGeneral) {
      setActiveTab('general');
    }
    if (activeTab === 'general' && !canViewGeneral && canViewSecurity) {
      setActiveTab('security');
    }
  }, [activeTab, canViewGeneral, canViewSecurity]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [securitySheetMode, setSecuritySheetMode] = useState<
    'setup' | 'verify' | 'disable-totp' | 'email-password' | 'backup-codes' | null
  >(null);
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [email2FAEnableMode, setEmail2FAEnableMode] = useState(true);
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);

  const {
    data,
    loading,
    refreshing,
    error,
    savingProfile,
    updatingPassword,
    securityBusy,
    feedback,
    clearFeedback,
    refresh,
    fetchProfile,
    updateProfile,
    updatePassword,
    toggleSecuritySettings,
    pickAvatar,
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
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      jobTitle: '',
      phone: '',
      country: '',
      timezone: '',
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
      firstName: data.profile.firstName,
      lastName: data.profile.lastName,
      username: data.user.username,
      email: data.user.email,
      jobTitle: data.profile.jobTitle,
      phone: data.profile.phone,
      country: data.profile.country,
      timezone: data.profile.timezone,
      bio: data.profile.bio,
    });
  }, [data, profileForm]);

  const profileValues = profileForm.watch();
  const passwordValues = passwordForm.watch();

  const saveProfile = profileForm.handleSubmit(async (values) => {
    const ok = await updateProfile(values, pendingAvatar ?? undefined);
    if (ok) {
      setPendingAvatar(null);
    }
  });

  const resetPasswordForm = () => {
    passwordForm.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  };

  const closePassword = () => {
    resetPasswordForm();
    setPasswordOpen(false);
  };

  const submitPassword = passwordForm.handleSubmit(async (values) => {
    const ok = await updatePassword(values);
    if (ok) {
      resetPasswordForm();
      setPasswordOpen(false);
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
        <PageSectionHeader
          title={copy.title}
          subtitle={copy.subtitle}
          titleAddon={<ViewOnlyBadge visible={!canWrite} />}
        />
      ) : (
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={[typography.pageDisplay, { color: colors.text, flexShrink: 1 }]}>{copy.title}</Text>
            <ViewOnlyBadge visible={!canWrite} />
          </View>
          <Text style={[typography.body, { color: colors.textMuted }]}>{copy.subtitle}</Text>
        </View>
      )}
      <StatePanel loading={loading} error={error} onRetry={fetchProfile}>
        <ModuleWriteProvider canWrite={canWrite}>
        {data ? (
          <View style={{ gap: spacing.lg }}>
            <ProfileTabs
              activeTab={activeTab}
              compact={isCompact}
              showGeneral={canViewGeneral}
              showSecurity={canViewSecurity}
              onChange={(tab) => {
                clearFeedback();
                setActiveTab(tab);
              }}
            />

            {activeTab === 'general' && canViewGeneral ? (
              <ProfileSectionCard
                icon={UserRound}
                title={copy.sections.personal.title}
                subtitle={copy.sections.personal.description}
                footer={
                  canWrite ? (
                    <AppButton
                      label={savingProfile ? copy.saving : copy.save}
                      icon={Save}
                      onPress={saveProfile}
                      loading={savingProfile}
                      disabled={!canWrite || savingProfile}
                      fullWidth={isCompact || !isWeb}
                      noTopMargin
                    />
                  ) : null
                }>
                <ProfileHeader
                  name={data.user.name}
                  role={data.user.role}
                  jobTitle={data.profile.jobTitle}
                  joinedAt={data.user.joinedAt}
                  avatar={pendingAvatar || data.user.avatar}
                  readOnly={!canWrite}
                  onAvatarPress={() => {
                    void (async () => {
                      const next = await pickAvatar();
                      if (next) setPendingAvatar(next);
                    })();
                  }}
                  compact={isCompact}
                />
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                <View
                  style={[
                    styles.generalGrid,
                    {
                      gap: spacing.md,
                      flexDirection: isCompact ? 'column' : 'row',
                    },
                  ]}>
                  <View style={[styles.col, isCompact ? styles.colStacked : styles.colSplit]}>
                    <PersonalInfoForm
                      embedded
                      firstName={profileValues.firstName}
                      lastName={profileValues.lastName}
                      username={profileValues.username}
                      email={profileValues.email}
                      jobTitle={profileValues.jobTitle}
                      readOnly={!canWrite}
                      onChange={(key, next) => {
                        clearFeedback();
                        profileForm.setValue(key, next, { shouldDirty: true, shouldValidate: true });
                      }}
                      errors={{
                        firstName: profileForm.formState.errors.firstName?.message,
                        lastName: profileForm.formState.errors.lastName?.message,
                        email: profileForm.formState.errors.email?.message,
                        jobTitle: profileForm.formState.errors.jobTitle?.message,
                      }}
                    />
                  </View>
                  <View style={[styles.col, isCompact ? styles.colStacked : styles.colSplit]}>
                    <ContactLocationForm
                      embedded
                      phone={profileValues.phone}
                      country={profileValues.country}
                      timezone={profileValues.timezone}
                      bio={profileValues.bio}
                      readOnly={!canWrite}
                      onCountryChange={(nextCountry, nextTimezone) => {
                        clearFeedback();
                        profileForm.setValue('country', nextCountry, { shouldDirty: true, shouldValidate: true });
                        profileForm.setValue('timezone', nextTimezone, { shouldDirty: true, shouldValidate: true });
                        profileForm.setValue('phone', '', { shouldDirty: true, shouldValidate: true });
                      }}
                      onChange={(key, next) => {
                        clearFeedback();
                        profileForm.setValue(key, next, { shouldDirty: true, shouldValidate: true });
                      }}
                      errors={{
                        phone: profileForm.formState.errors.phone?.message,
                        country: profileForm.formState.errors.country?.message,
                        timezone: profileForm.formState.errors.timezone?.message,
                        bio: profileForm.formState.errors.bio?.message,
                      }}
                    />
                  </View>
                </View>
              </ProfileSectionCard>
            ) : activeTab === 'security' && canViewSecurity ? (
              <ProfileSectionCard
                icon={Shield}
                title={copy.sections.password.title}
                subtitle={copy.sections.password.description}>
                <SecuritySettings
                  embedded
                  security={data.security}
                  securityBusy={securityBusy}
                  readOnly={!canWrite}
                  onPasswordPress={() => setPasswordOpen(true)}
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
              </ProfileSectionCard>
            ) : null}
          </View>
        ) : (
          <FormErrorBanner message={t('profile.errors.loadFailed')} />
        )}
        </ModuleWriteProvider>

      </StatePanel>

      <ProfilePasswordSheet
        visible={passwordOpen}
        currentPassword={passwordValues.currentPassword}
        newPassword={passwordValues.newPassword}
        confirmPassword={passwordValues.confirmPassword}
        errors={{
          currentPassword: passwordForm.formState.errors.currentPassword?.message,
          newPassword: passwordForm.formState.errors.newPassword?.message,
          confirmPassword: passwordForm.formState.errors.confirmPassword?.message,
        }}
        loading={updatingPassword}
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
        onSubmit={submitPassword}
        onClose={closePassword}
      />

      <SessionManagementSheet
        visible={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        loadSessions={loadSessions}
        onRevokeSession={revokeSession}
        onRevokeOthers={revokeOtherSessions}
        canRevoke={canWrite}
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
  generalGrid: {
    width: '100%',
    alignSelf: 'stretch',
  },
  col: {
    minWidth: 0,
    maxWidth: '100%',
  },
  colSplit: {
    flex: 1,
    flexBasis: 0,
  },
  colStacked: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
});
