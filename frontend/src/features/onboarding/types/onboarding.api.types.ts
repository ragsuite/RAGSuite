import type { CrawlCadence } from '@/features/crawl/types/crawl.types';

export type OnboardingBrandingBody = {
  org_name: string;
  logo_data_url?: string | null;
  primary_color?: string | null;
};

export type OnboardingBrandingOut = {
  org_name?: string;
  logo_data_url?: string | null;
  primary_color?: string | null;
};

export type OnboardingProjectBody = {
  name: string;
  description?: string | null;
};

export type OnboardingProjectOut = {
  id?: string;
  project_id?: string;
  name?: string;
  description?: string | null;
};

export type OnboardingDataSourceBody = {
  base_url: string;
  depth?: number | null;
  cadence?: CrawlCadence | null;
  headless_mode?: 'AUTO' | 'ON' | 'OFF' | null;
};

export type OnboardingDataSourceOut = {
  base_url?: string;
  depth?: number | null;
  cadence?: CrawlCadence | null;
  headless_mode?: 'AUTO' | 'ON' | 'OFF' | null;
  crawl_status?: string | null;
  status?: string | null;
  message?: string | null;
  error?: string | null;
  project_id?: string | null;
};

export type OnboardingTestQueryBody = {
  query: string;
  project_id?: string | null;
};

export type OnboardingTestQueryOut = {
  answer?: string | null;
  response?: string | null;
  message?: string | null;
  content?: string | null;
};

export type OnboardingStatusOut = {
  completed_steps?: string[];
  current_step?: string | null;
  project_id?: string | null;
  needs_onboarding?: boolean;
  redirect_to?: string;
};

export type OnboardingSuggestionsOut = {
  suggestions: string[];
};

export type OnboardingCrawlResult = {
  status: 'completed' | 'invalid' | 'processing';
  message: string;
};
