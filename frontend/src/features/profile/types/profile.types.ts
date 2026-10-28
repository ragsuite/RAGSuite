import { z } from 'zod';

import { isOptionalPhoneValid } from '@/shared/geo/phone';

export type TimezoneOption = string;
export type SecurityToggleKey = 'twoFactorEnabled' | 'email2FAEnabled' | 'loginAlerts';
export type ProfileTabKey = 'general' | 'security' | 'access';

export type User = {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  role: string;
  joinedAt: string;
};

export type Profile = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  phoneCountryCode: string;
  country: string;
  timezone: TimezoneOption;
  bio: string;
};

export type Security = {
  twoFactorEnabled: boolean;
  email2FAEnabled: boolean;
  loginAlerts: boolean;
  hasBackupCodes: boolean;
};

export type ProfileBundle = {
  user: User;
  profile: Profile;
  security: Security;
};

export type UpdateProfilePayload = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  phoneCountryCode: string;
  country: string;
  timezone: TimezoneOption;
  bio: string;
  avatar?: string;
};

export type UpdatePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type ProfileSchemaTranslator = (key: string) => string;

export function createProfileFormSchema(t: ProfileSchemaTranslator) {
  return z
    .object({
      firstName: z.string().trim().min(1, t('auth.validation.firstNameRequired')),
      lastName: z.string().trim().min(1, t('auth.validation.lastNameRequired')),
      username: z.string(),
      email: z.string().email(t('auth.validation.email')).or(z.literal('')),
      jobTitle: z.string(),
      phone: z.string(),
      country: z.string(),
      timezone: z.string(),
      bio: z.string(),
    })
    .superRefine((data, ctx) => {
      const country = data.country.trim();
      if (country) {
        if (!data.timezone.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['timezone'],
            message: t('profile.fields.timezoneRequired'),
          });
        }
        if (!data.phone.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['phone'],
            message: t('profile.fields.phoneRequired'),
          });
          return;
        }
      }
      if (data.phone.trim() && !country) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phone'],
          message: t('profile.fields.phoneCountryRequired'),
        });
        return;
      }
      if (!isOptionalPhoneValid(data.phone, country)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phone'],
          message: t('profile.fields.phoneInvalid'),
        });
      }
    });
}

export function profileFormFieldErrors(
  t: ProfileSchemaTranslator,
  values: ProfileFormValues,
): Partial<Record<keyof ProfileFormValues, string>> {
  const result = createProfileFormSchema(t).safeParse(values);
  if (result.success) return {};
  const errors: Partial<Record<keyof ProfileFormValues, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key !== 'string' || errors[key as keyof ProfileFormValues]) continue;
    errors[key as keyof ProfileFormValues] = issue.message;
  }
  return errors;
}

export const profileFormSchema = createProfileFormSchema((key) => key);

export const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters long.'),
    confirmPassword: z.string().min(1, 'Please confirm your new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirm password do not match.',
    path: ['confirmPassword'],
  });

export type ProfileFormValues = z.infer<ReturnType<typeof createProfileFormSchema>>;
export type PasswordFormValues = z.infer<typeof passwordFormSchema>;
