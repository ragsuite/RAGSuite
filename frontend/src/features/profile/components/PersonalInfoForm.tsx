import React from 'react';
import { Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { AppTextField } from '@/shared/components/app-text-field';
import { CopyableReadOnlyField } from '@/shared/components/copyable-readonly-field';
import { FormCard } from '@/shared/components/form-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useTranslation } from '@/i18n';

type Props = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  jobTitle: string;
  errors: {
    firstName?: string;
    lastName?: string;
    email?: string;
    jobTitle?: string;
  };
  onChange: (key: 'firstName' | 'lastName' | 'jobTitle', value: string) => void;
  readOnly?: boolean;
  embedded?: boolean;
  /** Extra fields after email (Edit member: access level, status, groups). */
  afterEmail?: React.ReactNode;
};

export function PersonalInfoForm({
  firstName,
  lastName,
  username,
  email,
  jobTitle,
  errors,
  onChange,
  readOnly = false,
  embedded = false,
  afterEmail,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const copy = useProfileCopy();
  const { t } = useTranslation();

  const fields = (
    <View style={{ gap: spacing.sm, width: '100%', maxWidth: '100%' }}>
      {embedded ? null : (
        <>
          <Text style={[typography.subtitle, { color: colors.text }]}>{copy.sections.personal.title}</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
            {copy.sections.personal.description}
          </Text>
        </>
      )}
      <AppTextField
        label={copy.fields.firstName}
        value={firstName}
        onChangeText={(value) => onChange('firstName', value)}
        autoComplete="given-name"
        error={errors.firstName}
        editable={!readOnly}
        required
      />
      <AppTextField
        label={copy.fields.lastName}
        value={lastName}
        onChangeText={(value) => onChange('lastName', value)}
        autoComplete="family-name"
        error={errors.lastName}
        editable={!readOnly}
        required
      />
      <CopyableReadOnlyField
        label={copy.fields.username}
        value={username}
        copyA11yLabel={t('profile.fields.copyUsername')}
        copiedA11yLabel={t('profile.fields.copyCopied')}
        hintTitle={t('profile.fields.usernameLockedTitle')}
        hintBody={copy.fields.usernameLocked}
      />
      <CopyableReadOnlyField
        label={copy.fields.email}
        value={email}
        copyA11yLabel={t('profile.fields.copyEmail')}
        copiedA11yLabel={t('profile.fields.copyCopied')}
        hintTitle={copy.fields.emailLockedTitle}
        hintBody={copy.fields.emailLocked}
      />
      {afterEmail}
      <AppTextField
        label={copy.fields.jobTitle}
        value={jobTitle}
        placeholder={copy.fields.jobTitlePlaceholder}
        onChangeText={(value) => onChange('jobTitle', value)}
        error={errors.jobTitle}
        editable={!readOnly}
      />
    </View>
  );

  if (embedded) {
    return fields;
  }

  return <FormCard>{fields}</FormCard>;
}
