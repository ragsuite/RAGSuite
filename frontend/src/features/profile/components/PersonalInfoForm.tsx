import React from 'react';
import { Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { DEPARTMENT_OPTIONS } from '@/features/profile/types/profile.types';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  errors: {
    name?: string;
    email?: string;
    jobTitle?: string;
    department?: string;
  };
  onChange: (key: 'name' | 'jobTitle' | 'department', value: string) => void;
};

export function PersonalInfoForm({ name, email, jobTitle, department, errors, onChange }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const copy = useProfileCopy();

  return (
    <FormCard>
      <Text style={[typography.subtitle, { color: colors.text }]}>{copy.sections.personal.title}</Text>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        {copy.sections.personal.description}
      </Text>
      <View style={{ gap: spacing.sm }}>
        <AppTextField
          label={copy.fields.username}
          value={name}
          onChangeText={(value) => onChange('name', value)}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          error={errors.name}
        />
        <AppTextField label={copy.fields.email} value={email} editable={false} error={errors.email} />
        <Text style={[typography.caption, { color: colors.textMuted }]}>{copy.fields.emailLocked}</Text>
        <AppTextField
          label={copy.fields.jobTitle}
          value={jobTitle}
          placeholder={copy.fields.jobTitlePlaceholder}
          onChangeText={(value) => onChange('jobTitle', value)}
          error={errors.jobTitle}
        />
        <AppSelectField
          label={copy.fields.department}
          value={department}
          placeholder={copy.fields.departmentPlaceholder}
          options={DEPARTMENT_OPTIONS.map((option) => ({
            key: option,
            label: copy.departments[option as keyof typeof copy.departments] ?? option,
          }))}
          onChange={(value) => onChange('department', value)}
          error={errors.department}
          accessibilityLabel={copy.fields.department}
        />
      </View>
    </FormCard>
  );
}
