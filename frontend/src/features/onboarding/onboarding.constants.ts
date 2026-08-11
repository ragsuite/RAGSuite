import type { SelectOption } from '@/shared/components/app-select-field';
import { BRANDING_DEFAULTS, BRANDING_THEME_PRESETS } from '@/shared/constants/branding-defaults';

export const ONBOARDING_DRAFT_KEY = 'ragsuite.onboarding.draft';

export const ONBOARDING_PRIMARY_DEFAULT = BRANDING_DEFAULTS.primaryColor;

export const ONBOARDING_THEME_PRESETS = [...BRANDING_THEME_PRESETS] as const;

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function getOnboardingCopy(t: TranslateFn) {
  return {
    branding: {
      orgNameLabel: t('onboarding.branding.orgName.label'),
      orgNamePlaceholder: t('onboarding.branding.orgName.placeholder'),
      logoLabel: t('onboarding.branding.logo.label'),
      primaryColorLabel: t('onboarding.branding.primaryColor.label'),
      themePresetsLabel: t('onboarding.branding.themePresets.label'),
      previewCaption: t('onboarding.preview.branding.description'),
    },
    project: {
      nameLabel: t('onboarding.project.name.label'),
      namePlaceholder: t('onboarding.project.name.placeholder'),
      nameHelper: t('onboarding.project.name.helper'),
      descriptionLabel: t('onboarding.project.description.label'),
      descriptionPlaceholder: t('onboarding.project.description.placeholder'),
      descriptionHelper: t('onboarding.project.description.helper'),
      previewBadge: t('onboarding.preview.project.activeBadge'),
    },
    dataSource: {
      urlLabel: t('onboarding.dataSource.url.label'),
      urlPlaceholder: t('onboarding.dataSource.url.placeholder'),
      urlHelper: t('onboarding.dataSource.url.helper'),
      depthLabel: t('onboarding.dataSource.depth.label'),
      frequencyLabel: t('onboarding.dataSource.cadence.label'),
      headlessLabel: t('onboarding.dataSource.headless.label'),
      headlessHelper: t('onboarding.dataSource.headless.helper'),
      crawlSuccessTitle: t('onboarding.dataSource.success.title'),
      crawlSuccessBody: t('onboarding.dataSource.success.description'),
      crawlInvalidTitle: t('onboarding.dataSource.invalid.title'),
      crawlInvalidBody: t('onboarding.dataSource.invalid.description'),
    },
    quickTest: {
      title: t('onboarding.test.title'),
      body: t('onboarding.test.helper'),
      placeholder: t('onboarding.test.placeholder'),
    },
    systemStatus: [
      t('onboarding.preview.status.orgConfigured'),
      t('onboarding.preview.status.projectCreated'),
      t('onboarding.preview.status.dataSourceAdded'),
      t('onboarding.preview.status.aiModelReady'),
      t('onboarding.preview.status.vectorDbReady'),
    ],
  };
}

export function getCrawlDepthOptions(t: TranslateFn): SelectOption<'1' | '2' | '3'>[] {
  return [
    { key: '1', label: t('onboarding.dataSource.depth.option1') },
    { key: '2', label: t('onboarding.dataSource.depth.option2') },
    { key: '3', label: t('onboarding.dataSource.depth.option3') },
  ];
}

export function getCrawlFrequencyOptions(t: TranslateFn): SelectOption<'once' | 'daily' | 'weekly'>[] {
  return [
    { key: 'once', label: t('onboarding.dataSource.cadence.once') },
    { key: 'daily', label: t('onboarding.dataSource.cadence.daily') },
    { key: 'weekly', label: t('onboarding.dataSource.cadence.weekly') },
  ];
}

export function formatCrawlFrequencyLabel(value: 'once' | 'daily' | 'weekly', t: TranslateFn): string {
  return getCrawlFrequencyOptions(t).find((option) => option.key === value)?.label ?? value;
}

export function formatCrawlDepthLabel(value: '1' | '2' | '3', t: TranslateFn): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return t('common.notSet');
  if (numeric === 1) return t('onboarding.dataSource.depth.option1');
  return t('onboarding.preview.crawl.depthValue', { count: numeric });
}
