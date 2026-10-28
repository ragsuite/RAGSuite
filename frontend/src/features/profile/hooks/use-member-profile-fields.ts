import { useCallback, useEffect, useMemo, useState } from 'react';

import { pickAvatarDataUrl } from '@/features/profile/services/profile.service';
import { profileFormFieldErrors } from '@/features/profile/types/profile.types';
import { resolveAvatarUrl } from '@/features/profile/utils/profile-api-mappers';
import { defaultTimezoneForCountry } from '@/shared/geo/country-options';
import { nationalNumberFromStored, toE164 } from '@/shared/geo/phone';
import { useTranslation } from '@/i18n';

export type MemberProfileSource = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  jobTitle: string;
  phoneNumber: string;
  phoneCountryCode: string;
  country: string;
  timezone: string;
  bio: string;
  avatar: string | null;
  createdAt: string;
  role: string;
};

export type MemberProfileUpdateFields = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  phoneNumber: string;
  phoneCountryCode: string;
  country: string;
  timezone: string;
  bio: string;
  avatar?: string;
};

export function useMemberProfileFields(user: MemberProfileSource | null) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [bio, setBio] = useState('');
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof profileFormFieldErrors>>({});

  useEffect(() => {
    if (!user) return;
    const nextCountry = (user.country || user.phoneCountryCode || '').toUpperCase();
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setJobTitle(user.jobTitle);
    setPhone(nationalNumberFromStored(user.phoneNumber, nextCountry));
    setCountry(nextCountry);
    setTimezone(user.timezone || defaultTimezoneForCountry(nextCountry));
    setBio(user.bio);
    setPendingAvatar(null);
    setErrors({});
  }, [user]);

  const displayName = `${firstName} ${lastName}`.trim() || user?.username || '';
  const avatar = pendingAvatar || resolveAvatarUrl(user?.avatar, displayName || 'User');

  const personalOnChange = useCallback((key: 'firstName' | 'lastName' | 'jobTitle', value: string) => {
    if (key === 'firstName') setFirstName(value);
    if (key === 'lastName') setLastName(value);
    if (key === 'jobTitle') setJobTitle(value);
    setErrors((current) => ({ ...current, [key]: undefined }));
  }, []);

  const onCountryChange = useCallback((nextCountry: string, nextTimezone: string) => {
    setCountry(nextCountry);
    setTimezone(nextTimezone);
    setPhone('');
    setErrors((current) => ({ ...current, phone: undefined, timezone: undefined, country: undefined }));
  }, []);

  const contactOnChange = useCallback((key: 'phone' | 'timezone' | 'bio' | 'country', value: string) => {
    if (key === 'phone') setPhone(value);
    if (key === 'timezone') setTimezone(value);
    if (key === 'bio') setBio(value);
    if (key === 'country') setCountry(value);
    setErrors((current) => ({ ...current, [key]: undefined }));
  }, []);

  const pickAvatar = useCallback(() => {
    void (async () => {
      try {
        setPendingAvatar(await pickAvatarDataUrl());
      } catch (error) {
        if (String((error as Error)?.message ?? '').includes('cancelled')) return;
      }
    })();
  }, []);

  const validate = useCallback((): MemberProfileUpdateFields | null => {
    const nextErrors = profileFormFieldErrors(t, {
      firstName,
      lastName,
      username: user?.username ?? '',
      email: user?.email ?? '',
      jobTitle,
      phone,
      country,
      timezone,
      bio,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return null;
    const region = country.trim().toUpperCase();
    const e164 = region && phone.trim() ? toE164(phone, region) : null;
    return {
      firstName,
      lastName,
      jobTitle,
      phoneNumber: phone.trim() ? e164 ?? '' : '',
      phoneCountryCode: region,
      country: region,
      timezone,
      bio,
      ...(pendingAvatar ? { avatar: pendingAvatar } : {}),
    };
  }, [bio, country, firstName, jobTitle, lastName, pendingAvatar, phone, t, timezone, user?.email, user?.username]);

  return useMemo(
    () => ({
      firstName,
      lastName,
      jobTitle,
      phone,
      country,
      timezone,
      bio,
      errors,
      displayName,
      avatar,
      personalOnChange,
      onCountryChange,
      contactOnChange,
      pickAvatar,
      validate,
    }),
    [
      avatar,
      bio,
      contactOnChange,
      country,
      displayName,
      errors,
      firstName,
      jobTitle,
      lastName,
      onCountryChange,
      personalOnChange,
      phone,
      pickAvatar,
      timezone,
      validate,
    ],
  );
}
