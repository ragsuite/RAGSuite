import { z } from 'zod';

import type { SignInPayload, SignUpPayload } from '@/features/auth/auth.types';
import { USERNAME_PATTERN } from '@/shared/validation/username';

const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export type AuthSchemaTranslator = (key: string) => string;

export function createAuthFormSchemas(t: AuthSchemaTranslator) {
  const signInSchema = z.object({
    email: z.string().trim().regex(USERNAME_PATTERN, t('auth.validation.username')),
    password: z.string().min(8, t('auth.validation.passwordMin')),
    rememberMe: z.boolean().optional(),
  });

  const signUpSchema = z
    .object({
      fullName: z.string().trim().regex(USERNAME_PATTERN, t('auth.validation.username')),
      email: z.string().trim().email(t('auth.validation.email')),
      password: z.string().regex(passwordRegex, t('auth.validation.passwordFormat')),
      confirmPassword: z.string().min(1, t('auth.validation.confirmPasswordRequired')),
      agreeToTerms: z.boolean(),
    })
    .refine((data) => data.confirmPassword === data.password, {
      path: ['confirmPassword'],
      message: t('auth.validation.passwordsMismatch'),
    })
    .refine((data) => data.agreeToTerms, {
      path: ['agreeToTerms'],
      message: t('auth.validation.acceptTerms'),
    });

  const verify2FASchema = z.object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, t('verifyEmail.errors.invalidCodeLength')),
  });

  const verifyEmailSchema = z.object({
    email: z.string().trim().email(t('auth.validation.email')),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, t('verifyEmail.errors.invalidCodeLength')),
  });

  return {
    signInSchema,
    signUpSchema,
    verify2FASchema,
    verifyEmailSchema,
  };
}

export type SignInFormValues = SignInPayload;
export type SignUpFormValues = SignUpPayload;
export type Verify2FAFormValues = z.infer<ReturnType<typeof createAuthFormSchemas>['verify2FASchema']>;
export type VerifyEmailFormValues = z.infer<ReturnType<typeof createAuthFormSchemas>['verifyEmailSchema']>;

/** @deprecated Use createAuthFormSchemas(t).signInSchema */
export const signInSchema = z.object({
  email: z.string().trim().regex(USERNAME_PATTERN, 'Username must be 3-24 chars and can use letters, numbers, and underscores.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  rememberMe: z.boolean().optional(),
});

/** @deprecated Use createAuthFormSchemas(t).signUpSchema */
export const signUpSchema = z
  .object({
    fullName: z.string().trim().regex(USERNAME_PATTERN, 'Username must be 3-24 chars and can use letters, numbers, and underscores.'),
    email: z.string().trim().email('Enter a valid email address.'),
    password: z.string().regex(passwordRegex, 'Use at least 8 chars with letters and numbers.'),
    confirmPassword: z.string().min(1, 'Confirm password is required.'),
    agreeToTerms: z.boolean(),
  })
  .refine((data) => data.confirmPassword === data.password, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
  .refine((data) => data.agreeToTerms, {
    path: ['agreeToTerms'],
    message: 'Please accept terms to continue.',
  });

/** @deprecated Use createAuthFormSchemas(t).verify2FASchema */
export const verify2FASchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator or email.'),
});

/** @deprecated Use createAuthFormSchemas(t).verifyEmailSchema */
export const verifyEmailSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});
