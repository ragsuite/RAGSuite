import type {
  AzureDeploymentsListPayload,
  AzureDeploymentsListResult,
  ModelConfigurationResponse,
  ProviderConfigResponse,
  ProviderConfigSavePayload,
  ProviderTestPayload,
  ProviderTestResponse,
} from '@/features/model-configuration/types/model-configuration.types';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post, put } from '@/network/request';

function withProject(path: string, projectId: string, extra: Record<string, string> = {}): string {
  const search = new URLSearchParams({ project_id: projectId.trim(), ...extra });
  return `${path}?${search.toString()}`;
}

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** `live: false` skips provider model-list probes (fast; used by widget pickers). */
export async function handleListModelProviders(
  projectId: string,
  options: { live?: boolean } = {},
): Promise<ModelConfigurationResponse> {
  const extra: Record<string, string> = options.live === false ? { live: 'false' } : {};
  const body = await get<ModelConfigurationResponse>(
    withProject(API_CONFIG.MODEL_CONFIGURATION_PROVIDERS, projectId, extra),
  );
  return unwrapBody<ModelConfigurationResponse>(body);
}

export async function handleSaveModelProvider(
  provider: string,
  payload: ProviderConfigSavePayload,
  projectId: string,
): Promise<ProviderConfigResponse> {
  // Save verifies the key with the provider first (same probes as Test connection).
  const body = await put<ProviderConfigSavePayload, ProviderConfigResponse>(
    withProject(API_CONFIG.modelConfigurationProvider(provider), projectId),
    payload,
    { timeout: 45_000 },
  );
  return unwrapBody<ProviderConfigResponse>(body);
}

export async function handleTestModelProvider(
  provider: string,
  payload: ProviderTestPayload,
  projectId: string,
): Promise<ProviderTestResponse> {
  // Chat + embed probes run sequentially server-side (up to ~26s total).
  const body = await post<ProviderTestPayload, ProviderTestResponse>(
    withProject(API_CONFIG.modelConfigurationProviderTest(provider), projectId),
    payload,
    { timeout: 30_000 },
  );
  return unwrapBody<ProviderTestResponse>(body);
}

export async function handleDeleteModelProvider(
  provider: string,
  projectId: string,
): Promise<{ deleted: boolean; provider: string }> {
  const body = await deleteApi<{ deleted: boolean; provider: string }>(
    withProject(API_CONFIG.modelConfigurationProvider(provider), projectId),
  );
  return unwrapBody<{ deleted: boolean; provider: string }>(body);
}

export async function handleListAzureDeployments(
  payload: AzureDeploymentsListPayload,
  projectId: string,
): Promise<AzureDeploymentsListResult> {
  const body = await post<AzureDeploymentsListPayload, AzureDeploymentsListResult>(
    withProject(API_CONFIG.MODEL_CONFIGURATION_AZURE_DEPLOYMENTS, projectId),
    payload,
    { timeout: 30_000 },
  );
  return unwrapBody<AzureDeploymentsListResult>(body);
}
