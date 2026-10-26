import React from 'react';
import { Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  name: string;
  email: string;
  jobTitle: string;
  errors: {
    name?: string;
    email?: string;
    jobTitle?: string;
  };
  onChange: (key: 'name' | 'jobTitle', value: string) => void;
  readOnly?: boolean;
  embedded?: boolean;
};

export function PersonalInfoForm({
  name,
  email,
  jobTitle,
  errors,
  onChange,
  readOnly = false,
  embedded = false,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const copy = useProfileCopy();

  const fields = (
    <View style={{ gap: spacing.sm }}>
      {embedded ? null : (
        <>
          <Text style={[typography.subtitle, { color: colors.text }]}>{copy.sections.personal.title}</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
            {copy.sections.personal.description}
          </Text>
        </>
      )}
      <AppTextField
        label={copy.fields.username}
        value={name}
        onChangeText={(value) => onChange('name', value)}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        error={errors.name}
        editable={!readOnly}
      />
      <AppTextField label={copy.fields.email} value={email} editable={false} error={errors.email} />
      <Text style={[typography.caption, { color: colors.textMuted }]}>{copy.fields.emailLocked}</Text>
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
