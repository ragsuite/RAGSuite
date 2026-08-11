import { useRouter } from 'expo-router';
import { resolvePostAuthHref } from '@/features/auth/utils/post-auth-redirect';
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import {
  completeInviteSetup,
  previewInviteSetup,
  type InviteSetupPreview,
} from '@/features/auth/services/invite-setup.api';
import { useSession } from '@/features/auth/providers/session-provider';
import { resolveInviteErrorMessage } from '@/features/auth/utils/invite-errors';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { PasswordField } from '@/shared/components/password-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useToastRef } from '@/shared/toast/use-toast-ref';

const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

type InviteSignInFormValues = {
  username: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type Props = {
  inviteToken: string;
  headerIcon: React.ComponentType<{ size?: number; color?: string }>;
};

export function InviteSignInForm({ inviteToken, headerIcon: HeaderIcon }: Props) {
  const router = useRouter();
  const { persistSessionFromInvite } = useSession();
  const { t } = useTranslation();
  const toastRef = useToastRef();
  const { colors } = useAppTheme();

  const [preview, setPreview] = useState<InviteSetupPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const inviteSchema = useMemo(
    () =>
      z
        .object({
          username: z.string().trim().min(3, t('auth.validation.username')),
          currentPassword: z.string().min(1, t('inviteSetup.validation.currentPasswordRequired')),
          newPassword: z.string().regex(passwordRegex, t('auth.validation.passwordFormat')),
          confirmPassword: z.string().min(1, t('auth.validation.confirmPasswordRequired')),
        })
        .refine((data) => data.confirmPassword === data.newPassword, {
          path: ['confirmPassword'],
          message: t('auth.validation.passwordsMismatch'),
        }),
    [t],
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<InviteSignInFormValues>({
    resolver: zodResolver(inviteSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      username: '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    const token = inviteToken.trim();
    if (!token) {
      setPreviewLoading(false);
      const message = t('inviteSetup.errors.invalid');
      setPreviewError(message);
      toastRef.current({ description: message, variant: 'error' });
      return;
    }

    let cancelled = false;
    void (async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const result = await previewInviteSetup(token);
        if (cancelled) return;
        setPreview(result);
        reset({
          username: result.username,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
      } catch (error) {
        if (!cancelled) {
          const message = resolveInviteErrorMessage(error, t);
          setPreviewError(message);
          toastRef.current({ description: message, variant: 'error' });
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteToken, reset, t, toastRef]);

  const onSubmit = handleSubmit(async (values) => {
    const token = inviteToken.trim();
    if (!token) {
      const message = t('inviteSetup.errors.invalid');
      setSubmitError(message);
      toastRef.current({ description: message, variant: 'error' });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const session = await completeInviteSetup({
        token,
        username: values.username.trim(),
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      await persistSessionFromInvite(session);
      router.replace(resolvePostAuthHref(session));
    } catch (error) {
      const message = resolveInviteErrorMessage(error, t);
      setSubmitError(message);
      toastRef.current({ description: message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <>
      <AuthFormHeader
        icon={HeaderIcon}
        title={t('inviteSetup.formTitle')}
        subtitle={
          preview
            ? t('inviteSetup.formHelper', { org: preview.organizationName, role: preview.role })
            : t('inviteSetup.formHelperLoading')
        }
      />
      {previewLoading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
      {previewError ? <FormErrorBanner message={previewError} /> : null}
      {!previewLoading && !previewError && preview ? (
        <>
          <Controller
            control={control}
            name="username"
            render={({ field: { value } }) => (
              <AppTextField label={t('inviteSetup.field.username')} value={value} editable={false} />
            )}
          />
          <Controller
            control={control}
            name="currentPassword"
            render={({ field: { value, onChange } }) => (
              <PasswordField
                label={t('inviteSetup.field.currentPassword')}
                value={value}
                onChangeText={onChange}
                placeholder={t('inviteSetup.field.currentPasswordPlaceholder')}
                error={errors.currentPassword?.message}
                autoComplete="password"
              />
            )}
          />
          <Controller
            control={control}
            name="newPassword"
            render={({ field: { value, onChange } }) => (
              <PasswordField
                label={t('inviteSetup.field.newPassword')}
                value={value}
                onChangeText={onChange}
                placeholder={t('inviteSetup.field.newPasswordPlaceholder')}
                error={errors.newPassword?.message}
                autoComplete="new-password"
              />
            )}
          />
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { value, onChange } }) => (
              <PasswordField
                label={t('inviteSetup.field.confirmPassword')}
                value={value}
                onChangeText={onChange}
                placeholder={t('inviteSetup.field.confirmPasswordPlaceholder')}
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
              />
            )}
          />
          {submitError ? <FormErrorBanner message={submitError} /> : null}
          <AppButton
            fullWidth
            size="compact"
            label={submitting ? t('inviteSetup.submit.loading') : t('inviteSetup.submit.label')}
            disabled={!isValid}
            loading={submitting}
            onPress={onSubmit}
          />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginVertical: 24,
  },
});
