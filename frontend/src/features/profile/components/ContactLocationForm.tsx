import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import {
  defaultTimezoneForCountry,
  dialCodeForCountry,
  flagEmoji,
  listCountries,
  timezonesForCountry,
} from '@/shared/geo/country-options';
import { clampNationalNumber, livePhoneInvalid, nationalMaxLength } from '@/shared/geo/phone';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useTranslation } from '@/i18n';

type ContactKey = 'phone' | 'timezone' | 'bio' | 'country';

type Props = {
  phone: string;
  country: string;
  timezone: string;
  bio: string;
  errors: {
    phone?: string;
    timezone?: string;
    bio?: string;
    country?: string;
  };
  onChange: (key: ContactKey, value: string) => void;
  onCountryChange?: (country: string, timezone: string) => void;
  readOnly?: boolean;
  embedded?: boolean;
};

export function ContactLocationForm({
  phone,
  country,
  timezone,
  bio,
  errors,
  onChange,
  onCountryChange,
  readOnly = false,
  embedded = false,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const copy = useProfileCopy();
  const { t, locale } = useTranslation();
  const countries = useMemo(() => listCountries(locale || 'en'), [locale]);
  const timezoneOptions = useMemo(() => timezonesForCountry(country), [country]);
  const dialCode = country ? dialCodeForCountry(country) : '';
  const flag = country ? flagEmoji(country) : '';
  const countrySet = Boolean(country);
  const timezoneDisabled = readOnly || !countrySet || timezoneOptions.length <= 1;
  const phoneMaxLength = countrySet ? nationalMaxLength(country) : undefined;
  const livePhoneError = livePhoneInvalid(phone, country) ? t('profile.fields.phoneInvalid') : undefined;

  const fields = (
    <View style={{ gap: spacing.sm, width: '100%', maxWidth: '100%' }}>
      {embedded ? null : (
        <>
          <Text style={[typography.subtitle, { color: colors.text }]}>{copy.sections.contact.title}</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
            {copy.sections.contact.description}
          </Text>
        </>
      )}
      <View pointerEvents={readOnly ? 'none' : 'auto'}>
        <AppSelectField
          label={copy.fields.country}
          value={country}
          placeholder={copy.fields.countryPlaceholder}
          searchable
          searchPlaceholder={t('profile.fields.countrySearch')}
          searchEmptyLabel={t('profile.fields.countrySearchEmpty')}
          options={countries.map((option) => ({
            key: option.code,
            label: `${option.name} (${option.dialCode})`,
            leading: option.flag ? <Text style={{ fontSize: 18, lineHeight: 22 }}>{option.flag}</Text> : undefined,
          }))}
          onChange={(value) => {
            const nextTz = defaultTimezoneForCountry(value);
            if (onCountryChange) {
              onCountryChange(value, nextTz);
              return;
            }
            onChange('country', value);
            onChange('timezone', nextTz);
          }}
          error={errors.country}
          accessibilityLabel={copy.fields.country}
        />
      </View>
      <View pointerEvents={timezoneDisabled ? 'none' : 'auto'}>
        <AppSelectField
          label={copy.fields.timezone}
          value={timezone}
          placeholder={copy.fields.timezonePlaceholder}
          disabled={timezoneDisabled}
          required={countrySet}
          options={timezoneOptions.map((zone) => ({ key: zone, label: zone }))}
          onChange={(value) => onChange('timezone', value)}
          error={errors.timezone}
          accessibilityLabel={copy.fields.timezone}
        />
      </View>
      <AppTextField
        label={copy.fields.phone}
        value={phone}
        placeholder={copy.fields.phonePlaceholder}
        onChangeText={(value) => onChange('phone', clampNationalNumber(value, country))}
        keyboardType="phone-pad"
        error={errors.phone || livePhoneError}
        editable={!readOnly}
        required={countrySet}
        maxLength={phoneMaxLength}
        leftAdornment={
          dialCode ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: spacing.sm,
                height: 32,
                borderRadius: surfaceRadius.button,
                backgroundColor: colors.surfaceMuted,
              }}>
              {flag ? <Text style={{ fontSize: 16, lineHeight: 20 }}>{flag}</Text> : null}
              <Text style={[typography.caption, { color: colors.text }]}>{dialCode}</Text>
            </View>
          ) : null
        }
      />
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
