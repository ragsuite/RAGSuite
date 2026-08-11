import type {
  OnboardingBrandingBody,
  OnboardingBrandingOut,
  OnboardingDataSourceBody,
  OnboardingDataSourceOut,
  OnboardingProjectBody,
  OnboardingStatusOut,
  OnboardingSuggestionsOut,
  OnboardingTestQueryBody,
  OnboardingTestQueryOut,
} from '@/features/onboarding/types/onboarding.api.types';
import { API_CONFIG } from '@/network/apiUrl';
import { get, post } from '@/network/request';

export async function handleGetOnboardingStatus(): Promise<OnboardingStatusOut> {
  return (await get<OnboardingStatusOut>(API_CONFIG.ONBOARDING_STATUS)) as OnboardingStatusOut;
}

export async function handleGetOnboardingBranding(): Promise<OnboardingBrandingOut | null> {
  const response = await get<OnboardingBrandingOut>(API_CONFIG.ONBOARDING_BRANDING);
  if (!response || typeof response !== 'object') return null;
  return response as OnboardingBrandingOut;
}

export async function handleSaveOnboardingBranding(body: OnboardingBrandingBody): Promise<void> {
  await post(API_CONFIG.ONBOARDING_BRANDING, body);
}

export async function handleSaveOnboardingProject(body: OnboardingProjectBody): Promise<unknown> {
  return post(API_CONFIG.ONBOARDING_PROJECT, body);
}

export async function handleSaveOnboardingDataSource(body: OnboardingDataSourceBody): Promise<unknown> {
  return post(API_CONFIG.ONBOARDING_DATA_SOURCE, body);
}

export async function handleGetOnboardingDataSource(): Promise<OnboardingDataSourceOut | null> {
  const response = await get<OnboardingDataSourceOut>(API_CONFIG.ONBOARDING_DATA_SOURCE);
  if (!response || typeof response !== 'object') return null;
  return response as OnboardingDataSourceOut;
}

export async function handleGetOnboardingCrawlStatus(): Promise<OnboardingDataSourceOut | null> {
  const response = await get<OnboardingDataSourceOut>(API_CONFIG.ONBOARDING_CRAWL_STATUS);
  if (!response || typeof response !== 'object') return null;
  return response as OnboardingDataSourceOut;
}

export async function handleTestOnboardingQuery(body: OnboardingTestQueryBody): Promise<OnboardingTestQueryOut> {
  return (await post<OnboardingTestQueryBody, OnboardingTestQueryOut>(
    API_CONFIG.ONBOARDING_TEST_QUERY,
    body,
  )) as OnboardingTestQueryOut;
}

export async function handleGetOnboardingSuggestions(params?: {
  projectId?: string | null;
  limit?: number;
}): Promise<OnboardingSuggestionsOut> {
  const search = new URLSearchParams();
  if (params?.projectId) {
    search.set('project_id', params.projectId);
  }
  if (params?.limit != null) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  const path = query ? `${API_CONFIG.ONBOARDING_SUGGESTIONS}?${query}` : API_CONFIG.ONBOARDING_SUGGESTIONS;
  return (await get<OnboardingSuggestionsOut>(path)) as OnboardingSuggestionsOut;
}

export async function handleCompleteOnboarding(): Promise<void> {
  await post(API_CONFIG.ONBOARDING_COMPLETE);
}
