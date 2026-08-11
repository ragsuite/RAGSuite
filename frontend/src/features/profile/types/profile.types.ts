import { z } from 'zod';

import { USERNAME_PATTERN } from '@/shared/validation/username';

const DEPARTMENT_OPTIONS_CONST = ['Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'Operations'] as const;
const TIMEZONE_OPTIONS_CONST = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
] as const;

export type DepartmentOption = (typeof DEPARTMENT_OPTIONS_CONST)[number] | string;
export type TimezoneOption = (typeof TIMEZONE_OPTIONS_CONST)[number] | string;
export type SecurityToggleKey = 'twoFactorEnabled' | 'email2FAEnabled' | 'loginAlerts';
export type ProfileTabKey = 'general' | 'security';

export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  joinedAt: string;
};

export type Profile = {
  jobTitle: string;
  department: DepartmentOption;
  phone: string;
  location: string;
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
  name: string;
  jobTitle: string;
  department: DepartmentOption;
  phone: string;
  location: string;
  timezone: TimezoneOption;
  bio: string;
};

export type UpdatePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export const DEPARTMENT_OPTIONS: DepartmentOption[] = [...DEPARTMENT_OPTIONS_CONST];
export const TIMEZONE_OPTIONS: readonly string[] = TIMEZONE_OPTIONS_CONST;

export type ProfileSchemaTranslator = (key: string) => string;

/** Same username rule as sign-in / sign-up (`auth.validation.username`). */
export function createProfileFormSchema(t: ProfileSchemaTranslator) {
  return z.object({
    name: z.string().trim().regex(USERNAME_PATTERN, t('auth.validation.username')),
    email: z.string().email('Please enter a valid email address.').or(z.literal('')),
    jobTitle: z.string(),
    department: z.string().trim().min(1, 'Department is required.'),
    phone: z.string(),
    location: z.string(),
    timezone: z.string().min(1, 'Timezone is required.'),
    bio: z.string(),
  });
}

/** @deprecated Prefer createProfileFormSchema(t) for i18n username errors. */
export const profileFormSchema = createProfileFormSchema((key) =>
  key === 'auth.validation.username'
    ? 'Username must be 3–24 characters (letters, numbers, underscores).'
    : key,
);

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
