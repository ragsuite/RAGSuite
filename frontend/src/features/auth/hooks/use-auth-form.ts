import { z } from 'zod';

import type { SignInPayload, SignUpPayload } from '@/features/auth/auth.types';

const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export type AuthSchemaTranslator = (key: string) => string;

function loginIdentifierSchema(t: AuthSchemaTranslator) {
  return z
    .string()
    .trim()
    .min(1, t('auth.validation.loginIdentifierRequired'))
    .superRefine((value, ctx) => {
      if (value.includes('@')) {
        const emailResult = z.string().email().safeParse(value);
        if (!emailResult.success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('auth.validation.email') });
        }
        return;
      }
      if (value.length > 50) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('auth.validation.loginIdentifierRequired'),
        });
      }
    });
}

/** Live error for a typed identifier; empty stays quiet so the field is not red on load. */
export function liveLoginIdentifierMessage(value: string, t: AuthSchemaTranslator): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const result = loginIdentifierSchema(t).safeParse(trimmed);
  if (result.success) return undefined;
  return result.error.issues[0]?.message;
}

export function createAuthFormSchemas(t: AuthSchemaTranslator) {
  const signInSchema = z.object({
    email: loginIdentifierSchema(t),
    password: z.string().min(8, t('auth.validation.passwordMin')),
    rememberMe: z.boolean().optional(),
  });

  const signUpSchema = z
    .object({
      firstName: z.string().trim().min(1, t('auth.validation.firstNameRequired')),
      lastName: z.string().trim().min(1, t('auth.validation.lastNameRequired')),
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
export const signInSchema = createAuthFormSchemas((key) => key).signInSchema;

/** @deprecated Use createAuthFormSchemas(t).signUpSchema */
export const signUpSchema = createAuthFormSchemas((key) => key).signUpSchema;

/** @deprecated Use createAuthFormSchemas(t).verify2FASchema */
export const verify2FASchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator or email.'),
});

/** @deprecated Use createAuthFormSchemas(t).verifyEmailSchema */
export const verifyEmailSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});
