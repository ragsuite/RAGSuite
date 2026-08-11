import type { OnboardingForm } from '@/features/onboarding/onboarding.types';
import type {
  OnboardingCrawlResult,
  OnboardingStatusOut,
} from '@/features/onboarding/types/onboarding.api.types';
import {
  mapBrandingFromApi,
  mapBrandingToApi,
  mapDataSourceFromApi,
  mapDataSourceToApi,
  mapProjectToApi,
  mapStatusProjectId,
  mapStatusToStep,
  mapTestQueryToApi,
  parseCrawlStatus,
  parseProjectId,
  parseTestQueryAnswer,
} from '@/features/onboarding/utils/onboarding-mappers';
import { uriToDataUrl } from '@/features/onboarding/utils/logo-data-url';
import { API_CONFIG } from '@/network/apiUrl';
import {
  handleCompleteOnboarding,
  handleGetOnboardingBranding,
  handleGetOnboardingDataSource,
  handleGetOnboardingStatus,
  handleGetOnboardingSuggestions,
  handleSaveOnboardingBranding,
  handleSaveOnboardingDataSource,
  handleSaveOnboardingProject,
  handleTestOnboardingQuery,
} from '@/network/actions/onboarding.actions';

export const ONBOARDING_API = {
  branding: API_CONFIG.ONBOARDING_BRANDING,
  project: API_CONFIG.ONBOARDING_PROJECT,
  dataSource: API_CONFIG.ONBOARDING_DATA_SOURCE,
  testQuery: API_CONFIG.ONBOARDING_TEST_QUERY,
  status: API_CONFIG.ONBOARDING_STATUS,
  crawlStatus: API_CONFIG.ONBOARDING_CRAWL_STATUS,
  suggestions: API_CONFIG.ONBOARDING_SUGGESTIONS,
  complete: API_CONFIG.ONBOARDING_COMPLETE,
} as const;

const CRAWL_POLL_INTERVAL_MS = 2000;
const CRAWL_POLL_MAX_ATTEMPTS = 45;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type OnboardingBootstrap = {
  status: OnboardingStatusOut;
  step: ReturnType<typeof mapStatusToStep>;
  projectId: string | null;
  branding: Partial<OnboardingForm['branding']>;
  dataSource: Partial<OnboardingForm['dataSource']>;
  suggestions: string[];
};

export async function fetchOnboardingBootstrap(): Promise<OnboardingBootstrap> {
  const status = await handleGetOnboardingStatus();
  const projectId = mapStatusProjectId(status);

  const [brandingRaw, dataSourceRaw, suggestionsRaw] = await Promise.all([
    handleGetOnboardingBranding().catch(() => null),
    handleGetOnboardingDataSource().catch(() => null),
    handleGetOnboardingSuggestions({
      projectId,
      limit: 4,
    }).catch(() => ({ suggestions: [] })),
  ]);

  const dataSourceMapped = mapDataSourceFromApi(dataSourceRaw);

  return {
    status,
    step: mapStatusToStep(status),
    projectId: projectId ?? dataSourceMapped.projectId ?? null,
    branding: mapBrandingFromApi(brandingRaw),
    dataSource: dataSourceMapped,
    suggestions: suggestionsRaw.suggestions ?? [],
  };
}

export async function saveOnboardingBranding(form: OnboardingForm): Promise<void> {
  const logoDataUrl = await uriToDataUrl(form.branding.logoUri);
  const body = await mapBrandingToApi(form.branding, logoDataUrl);
  await handleSaveOnboardingBranding(body);
}

export async function saveOnboardingProject(form: OnboardingForm): Promise<string | null> {
  const body = mapProjectToApi(form.project);
  const response = await handleSaveOnboardingProject(body);
  return parseProjectId(response);
}

export async function submitOnboardingDataSource(form: OnboardingForm): Promise<OnboardingCrawlResult> {
  const body = mapDataSourceToApi(form.dataSource);
  await handleSaveOnboardingDataSource(body);
  return pollOnboardingCrawlStatus();
}

export async function pollOnboardingCrawlStatus(): Promise<OnboardingCrawlResult> {
  for (let attempt = 0; attempt < CRAWL_POLL_MAX_ATTEMPTS; attempt += 1) {
    const raw = await handleGetOnboardingDataSource();
    const result = parseCrawlStatus(raw);
    if (result.status === 'completed' || result.status === 'invalid') {
      return result;
    }
    await wait(CRAWL_POLL_INTERVAL_MS);
  }

  return {
    status: 'processing',
    message: 'Crawl is still running. Please wait a moment and try again.',
  };
}

export async function testOnboardingQuery(
  question: string,
  projectId?: string | null,
): Promise<string> {
  const body = mapTestQueryToApi(question, projectId);
  const response = await handleTestOnboardingQuery(body);
  const answer = parseTestQueryAnswer(response);
  if (!answer) {
    throw new Error('errors.onboarding.noTestAnswer');
  }
  return answer;
}

export async function completeOnboardingOnServer(): Promise<void> {
  await handleCompleteOnboarding();
}

export async function resolveHasCompletedOnboarding(): Promise<boolean> {
  const status = await handleGetOnboardingStatus();
  return status.needs_onboarding === false;
}
