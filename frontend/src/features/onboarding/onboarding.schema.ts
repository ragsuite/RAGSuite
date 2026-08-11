import { z } from 'zod';

export const brandingSchema = z.object({
  organizationName: z.string().trim().min(2, 'Organization name is required.'),
  logoUri: z.string().optional(),
  primaryColor: z.string().min(4),
  themePreset: z.string().min(1),
});

export const projectSchema = z.object({
  projectName: z.string().trim().min(2, 'Project name is required.'),
  projectDescription: z
    .string()
    .trim()
    .min(3, 'Project description is required.')
    .max(500, 'Description must be under 500 characters.'),
});

export const dataSourceSchema = z.object({
  websiteUrl: z.string().trim().url('Enter a valid URL.'),
  crawlDepth: z.enum(['1', '2', '3']),
  crawlFrequency: z.enum(['once', 'daily', 'weekly']),
  headless: z.boolean(),
  crawlStatus: z.enum(['idle', 'processing', 'completed', 'invalid']),
});

export const quickTestSchema = z.object({
  question: z.string().trim().min(3, 'Ask a valid test question.'),
});

export const onboardingSchema = z.object({
  branding: brandingSchema,
  project: projectSchema,
  dataSource: dataSourceSchema,
  quickTest: quickTestSchema,
});
