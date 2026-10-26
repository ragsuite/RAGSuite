import { KeyRound } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  showSubmit?: boolean;
  embedded?: boolean;
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
  showSubmit = true,
  embedded = false,
  onChange,
  onSubmit,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const copy = useProfileCopy();

  const fields = (
    <View style={{ gap: spacing.sm }}>
      {embedded ? null : (
        <>
          <Text style={[typography.subtitle, { color: colors.text }]}>{copy.sections.password.title}</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
            {copy.sections.password.description}
          </Text>
        </>
      )}
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
      {showSubmit ? (
        <View style={embedded ? styles.submitEnd : undefined}>
          <AppButton
            label={loading ? copy.fields.updatingPassword : copy.fields.updatePassword}
            icon={KeyRound}
            onPress={onSubmit}
            loading={loading}
            disabled={disabled}
            fullWidth={!embedded}
            noTopMargin
          />
        </View>
      ) : null}
    </View>
  );

  if (embedded) {
    return fields;
  }

  return <FormCard>{fields}</FormCard>;
}

const styles = StyleSheet.create({
  submitEnd: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
