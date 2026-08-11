import { router } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { useSession } from '@/features/auth/providers/session-provider';
import { resolvePostAuthHref } from '@/features/auth/utils/post-auth-redirect';
import {
  completePasswordReset,
  previewPasswordReset,
} from '@/features/auth/services/password-reset.api';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { PasswordField } from '@/shared/components/password-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useToastRef } from '@/shared/toast/use-toast-ref';

type Props = {
  resetToken: string;
};

export function ResetPasswordForm({ resetToken }: Props) {
  const { t } = useTranslation();
  const toastRef = useToastRef();
  const { colors } = useAppTheme();
  const { persistSessionFromInvite } = useSession();
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewPasswordReset>> | null>(null);

  const schema = useMemo(
    () =>
      z
        .object({
          newPassword: z.string().min(8, t('resetPassword.validation.newPasswordMin')),
          confirmPassword: z.string().min(8, t('resetPassword.validation.confirmPasswordMin')),
        })
        .refine((values) => values.newPassword === values.confirmPassword, {
          message: t('resetPassword.validation.passwordsMismatch'),
          path: ['confirmPassword'],
        }),
    [t],
  );

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<{ newPassword: string; confirmPassword: string }>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  useEffect(() => {
    let cancelled = false;
    const token = resetToken.trim();
    if (!token) {
      const message = t('resetPassword.errors.invalid');
      setPreviewError(message);
      toastRef.current({ description: message, variant: 'error' });
      setPreviewLoading(false);
      return;
    }
    void (async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const result = await previewPasswordReset(token);
        if (!cancelled) {
          setPreview(result);
        }
      } catch (error) {
        if (!cancelled) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          const message =
            status === 410 ? t('resetPassword.errors.expired') : t('resetPassword.errors.invalid');
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
  }, [resetToken, t, toastRef]);

  const onSubmit = handleSubmit(async (values) => {
    const token = resetToken.trim();
    if (!token) {
      const message = t('resetPassword.errors.invalid');
      setSubmitError(message);
      toastRef.current({ description: message, variant: 'error' });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const session = await completePasswordReset({
        token,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      await persistSessionFromInvite(session);
      router.replace(resolvePostAuthHref(session));
    } catch {
      const message = t('resetPassword.errors.generic');
      setSubmitError(message);
      toastRef.current({ description: message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <>
      <AuthFormHeader
        icon={KeyRound}
        title={t('resetPassword.formTitle')}
        subtitle={
          preview
            ? t('resetPassword.formHelper', {
                org: preview.organizationName,
                role: preview.role === 'org_admin' ? t('org.members.role.orgAdmin') : t('org.members.role.member'),
              })
            : t('resetPassword.formHelperLoading')
        }
      />
      {previewLoading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
      {previewError ? <FormErrorBanner message={previewError} /> : null}
      {!previewLoading && !previewError && preview ? (
        <>
          <AppTextField label={t('resetPassword.field.username')} value={preview.username} editable={false} />
          <AppTextField label={t('resetPassword.field.email')} value={preview.email} editable={false} />
          <Controller
            control={control}
            name="newPassword"
            render={({ field: { value, onChange } }) => (
              <PasswordField
                label={t('resetPassword.field.newPassword')}
                placeholder={t('resetPassword.field.newPasswordPlaceholder')}
                value={value}
                onChangeText={onChange}
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
                label={t('resetPassword.field.confirmPassword')}
                placeholder={t('resetPassword.field.confirmPasswordPlaceholder')}
                value={value}
                onChangeText={onChange}
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
              />
            )}
          />
          {submitError ? <FormErrorBanner message={submitError} /> : null}
          <AppButton
            fullWidth
            label={submitting ? t('resetPassword.submit.loading') : t('resetPassword.submit.label')}
            disabled={!isValid || submitting}
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
    alignSelf: 'center',
    marginVertical: 12,
  },
});
