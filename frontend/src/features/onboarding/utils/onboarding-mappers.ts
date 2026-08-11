import type { CrawlCadence } from '@/features/crawl/types/crawl.types';
import type {
  OnboardingBrandingBody,
  OnboardingBrandingOut,
  OnboardingCrawlResult,
  OnboardingDataSourceBody,
  OnboardingDataSourceOut,
  OnboardingProjectBody,
  OnboardingStatusOut,
  OnboardingTestQueryBody,
  OnboardingTestQueryOut,
} from '@/features/onboarding/types/onboarding.api.types';
import type { OnboardingForm, OnboardingStep } from '@/features/onboarding/onboarding.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function mapFrequencyToCadence(value: OnboardingForm['dataSource']['crawlFrequency']): CrawlCadence {
  if (value === 'once') return 'ONCE';
  if (value === 'weekly') return 'WEEKLY';
  return 'DAILY';
}

export function mapCadenceToFrequency(value: CrawlCadence | null | undefined): OnboardingForm['dataSource']['crawlFrequency'] {
  if (value === 'ONCE') return 'once';
  if (value === 'WEEKLY') return 'weekly';
  return 'daily';
}

export function mapHeadlessToApi(enabled: boolean): 'ON' | 'OFF' {
  return enabled ? 'ON' : 'OFF';
}

export function mapHeadlessFromApi(value: 'AUTO' | 'ON' | 'OFF' | null | undefined): boolean {
  return value === 'ON' || value === 'AUTO';
}

export async function mapBrandingToApi(
  branding: OnboardingForm['branding'],
  logoDataUrl?: string | null,
): Promise<OnboardingBrandingBody> {
  return {
    org_name: branding.organizationName.trim(),
    logo_data_url: logoDataUrl ?? null,
    primary_color: branding.primaryColor || null,
  };
}

export function mapBrandingFromApi(raw: OnboardingBrandingOut | null | undefined): Partial<OnboardingForm['branding']> {
  if (!raw) return {};
  return {
    organizationName: raw.org_name ?? '',
    primaryColor: raw.primary_color ?? undefined,
    themePreset: raw.primary_color ?? undefined,
    logoUri: raw.logo_data_url ?? undefined,
  };
}

export function mapProjectToApi(project: OnboardingForm['project']): OnboardingProjectBody {
  return {
    name: project.projectName.trim(),
    description: project.projectDescription.trim() || null,
  };
}

export function mapDataSourceToApi(dataSource: OnboardingForm['dataSource']): OnboardingDataSourceBody {
  return {
    base_url: dataSource.websiteUrl.trim(),
    depth: Number(dataSource.crawlDepth),
    cadence: mapFrequencyToCadence(dataSource.crawlFrequency),
    headless_mode: mapHeadlessToApi(dataSource.headless),
  };
}

export function mapDataSourceFromApi(
  raw: OnboardingDataSourceOut | null | undefined,
): Partial<OnboardingForm['dataSource']> & { projectId?: string | null } {
  if (!raw) return {};
  const crawl = parseCrawlStatus(raw);
  return {
    websiteUrl: raw.base_url ?? '',
    crawlDepth: raw.depth != null ? String(Math.min(3, Math.max(1, raw.depth))) as '1' | '2' | '3' : undefined,
    crawlFrequency: mapCadenceToFrequency(raw.cadence),
    headless: mapHeadlessFromApi(raw.headless_mode),
    crawlStatus: crawl.status,
    crawlMessage: crawl.message,
    projectId: raw.project_id ?? null,
  };
}

export function mapTestQueryToApi(
  question: string,
  projectId?: string | null,
): OnboardingTestQueryBody {
  return {
    query: question.trim(),
    project_id: projectId ?? null,
  };
}

export function parseTestQueryAnswer(raw: OnboardingTestQueryOut | unknown): string | null {
  const record = asRecord(raw);
  if (!record) return null;
  const payload = asRecord(record.data) ?? record;
  return (
    pickString(payload.answer) ??
    pickString(payload.response) ??
    pickString(payload.message) ??
    pickString(payload.content)
  );
}

export function parseProjectId(raw: unknown): string | null {
  const record = asRecord(raw);
  if (!record) return null;
  const payload = asRecord(record.data) ?? record;
  return pickString(payload.project_id) ?? pickString(payload.id);
}

function normalizeCrawlToken(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function parseCrawlStatus(raw: OnboardingDataSourceOut | unknown): OnboardingCrawlResult {
  const record = asRecord(raw);
  const payload = record ? (asRecord(record.data) ?? record) : {};
  const token = normalizeCrawlToken(
    pickString(payload.crawl_status) ??
      pickString(payload.status) ??
      pickString(payload.crawlStatus) ??
      'IDLE',
  );
  const message =
    pickString(payload.message) ??
    pickString(payload.error) ??
    (token.includes('COMPLETED')
      ? 'Crawl completed successfully! You can now proceed to the next step.'
      : token.includes('INVALID')
        ? 'The URL you entered is invalid. Please enter a valid website URL and try again.'
        : 'Crawl in progress...');

  if (token.includes('COMPLETED') || token === 'DONE' || token === 'SUCCESS') {
    return { status: 'completed', message };
  }
  if (token.includes('INVALID') || token.includes('FAILED') || token.includes('ERROR')) {
    return { status: 'invalid', message };
  }
  if (token.includes('PROCESS') || token.includes('PENDING') || token.includes('RUNNING') || token === 'CRAWLING') {
    return { status: 'processing', message };
  }
  return { status: 'processing', message };
}

const STEP_ORDER = ['branding', 'project', 'data_source', 'data-source', 'quick_test', 'quick-test'] as const;

function normalizeStepName(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, '_');
}

export function mapStatusToStep(status: OnboardingStatusOut | null | undefined): OnboardingStep {
  if (!status) return 1;

  const current = status.current_step ? normalizeStepName(status.current_step) : null;
  if (current === 'branding') return 1;
  if (current === 'project' || current === 'data_source' || current === 'quick_test') return 2;

  const completed = new Set((status.completed_steps ?? []).map(normalizeStepName));
  if (!completed.has('branding')) return 1;
  return 2;
}

export function isOnboardingComplete(status: OnboardingStatusOut | null | undefined): boolean {
  if (!status) return false;
  return status.needs_onboarding === false;
}

export function mapStatusProjectId(status: OnboardingStatusOut | null | undefined): string | null {
  return status?.project_id ?? null;
}
