import React from 'react';
import { Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { AppButton } from '@/shared/components/app-button';
import { FormCard } from '@/shared/components/form-card';
import { PasswordField } from '@/shared/components/password-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  errors: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
  loading: boolean;
  disabled: boolean;
  onChange: (key: 'currentPassword' | 'newPassword' | 'confirmPassword', value: string) => void;
  onSubmit: () => void;
};

export function PasswordForm({
  currentPassword,
  newPassword,
  confirmPassword,
  errors,
  loading,
  disabled,
  onChange,
  onSubmit,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const copy = useProfileCopy();

  return (
    <FormCard>
      <Text style={[typography.subtitle, { color: colors.text }]}>{copy.sections.password.title}</Text>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        {copy.sections.password.description}
      </Text>
      <View style={{ gap: spacing.sm }}>
        <PasswordField
          label={copy.fields.currentPassword}
          placeholder={copy.fields.currentPasswordPlaceholder}
          value={currentPassword}
          onChangeText={(value) => onChange('currentPassword', value)}
          error={errors.currentPassword}
          preventAutofill
          autoComplete="off"
        />
        <PasswordField
          label={copy.fields.newPassword}
          placeholder={copy.fields.newPasswordPlaceholder}
          value={newPassword}
          onChangeText={(value) => onChange('newPassword', value)}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <PasswordField
          label={copy.fields.confirmPassword}
          placeholder={copy.fields.confirmPasswordPlaceholder}
          value={confirmPassword}
          onChangeText={(value) => onChange('confirmPassword', value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />
        <AppButton
          label={loading ? copy.fields.updatingPassword : copy.fields.updatePassword}
          onPress={onSubmit}
          loading={loading}
          disabled={disabled}
          fullWidth
          noTopMargin
        />
      </View>
    </FormCard>
  );
}
