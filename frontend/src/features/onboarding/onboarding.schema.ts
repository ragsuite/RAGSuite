import { z } from 'zod';

export type OnboardingSchemaTranslator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export function createOnboardingSchemas(t: OnboardingSchemaTranslator) {
  const brandingSchema = z.object({
    organizationName: z.string().trim().min(2, t('onboarding.branding.orgName.required')),
    logoUri: z.string().optional(),
    primaryColor: z.string().min(4),
    themePreset: z.string().min(1),
  });

  const projectSchema = z.object({
    projectName: z.string().trim().min(2, t('onboarding.project.name.required')),
    projectDescription: z
      .string()
      .trim()
      .min(3, t('onboarding.project.description.required'))
      .max(500, t('onboarding.project.description.errorMax', { max: 500 })),
  });

  const dataSourceSchema = z.object({
    websiteUrl: z.string().trim().url(t('onboarding.dataSource.url.invalid')),
    crawlDepth: z.enum(['1', '2', '3']),
    crawlFrequency: z.enum(['once', 'daily', 'weekly']),
    headless: z.boolean(),
    crawlStatus: z.enum(['idle', 'processing', 'completed', 'invalid']),
  });

  const quickTestSchema = z.object({
    question: z.string().trim().min(3, t('onboarding.test.question.required')),
  });

  const onboardingSchema = z.object({
    branding: brandingSchema,
    project: projectSchema,
    dataSource: dataSourceSchema,
    quickTest: quickTestSchema,
  });

  return { brandingSchema, projectSchema, dataSourceSchema, quickTestSchema, onboardingSchema };
}

/** English-only fallback for non-UI structural checks. Prefer `createOnboardingSchemas(t)`. */
const fallbackT: OnboardingSchemaTranslator = (key) => key;
export const brandingSchema = createOnboardingSchemas(fallbackT).brandingSchema;
export const projectSchema = createOnboardingSchemas(fallbackT).projectSchema;
export const onboardingSchema = createOnboardingSchemas(fallbackT).onboardingSchema;
