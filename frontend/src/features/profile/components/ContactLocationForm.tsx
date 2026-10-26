import React from 'react';
import { Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  phone: string;
  location: string;
  timezone: string;
  bio: string;
  errors: {
    phone?: string;
    location?: string;
    timezone?: string;
    bio?: string;
  };
  onChange: (key: 'phone' | 'location' | 'timezone' | 'bio', value: string) => void;
  readOnly?: boolean;
  embedded?: boolean;
};

export function ContactLocationForm({
  phone,
  location,
  timezone,
  bio,
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
          <Text style={[typography.subtitle, { color: colors.text }]}>{copy.sections.contact.title}</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
            {copy.sections.contact.description}
          </Text>
        </>
      )}
      <AppTextField
        label={copy.fields.phone}
        value={phone}
        placeholder={copy.fields.phonePlaceholder}
        onChangeText={(value) => onChange('phone', value)}
        keyboardType="phone-pad"
        error={errors.phone}
        editable={!readOnly}
      />
      <AppTextField
        label={copy.fields.location}
        value={location}
        onChangeText={(value) => onChange('location', value)}
        error={errors.location}
        editable={!readOnly}
      />
      <View pointerEvents={readOnly ? 'none' : 'auto'}>
        <AppSelectField
          label={copy.fields.timezone}
          value={timezone}
          placeholder={copy.fields.timezonePlaceholder}
          options={copy.timezones.map((option) => ({ key: option.value, label: option.label }))}
          onChange={(value) => onChange('timezone', value)}
          error={errors.timezone}
          accessibilityLabel={copy.fields.timezone}
        />
      </View>
      <AppTextField
        label={copy.fields.bio}
        value={bio}
        placeholder={copy.fields.bioPlaceholder}
        onChangeText={(value) => onChange('bio', value)}
        error={errors.bio}
        multiline
        numberOfLines={2}
        editable={!readOnly}
      />
    </View>
  );

  if (embedded) {
    return fields;
  }

  return <FormCard>{fields}</FormCard>;
}
