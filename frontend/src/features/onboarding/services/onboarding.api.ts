/** @deprecated Import from onboarding.service */
export {
  ONBOARDING_API,
  pollOnboardingCrawlStatus,
  saveOnboardingBranding,
  saveOnboardingProject,
  submitOnboardingDataSource,
  testOnboardingQuery,
} from '@/features/onboarding/services/onboarding.service';

export type { OnboardingCrawlResult } from '@/features/onboarding/types/onboarding.api.types';

import { submitOnboardingDataSource } from '@/features/onboarding/services/onboarding.service';
import type { OnboardingCrawlResult } from '@/features/onboarding/types/onboarding.api.types';

export async function startCrawl(form: {
  dataSource: {
    websiteUrl: string;
    crawlDepth: '1' | '2' | '3';
    crawlFrequency: 'once' | 'daily' | 'weekly';
    headless: boolean;
  };
}): Promise<OnboardingCrawlResult> {
  return submitOnboardingDataSource(form as Parameters<typeof submitOnboardingDataSource>[0]);
}
