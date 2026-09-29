import type {
  ModelConfigurationBundle,
  ModelProviderKey,
  ProviderConfig,
  ProviderConfigSavePayload,
  ProviderConnectionResult,
  ProviderTestPayload,
} from '@/features/model-configuration/types/model-configuration.types';
import {
  mapModelConfigurationResponse,
  mapProviderConfig,
} from '@/features/model-configuration/utils/model-configuration.mappers';
import { formatSplitConnectionTestResult } from '@/features/search-config/utils/search-model-settings';
import {
  handleDeleteModelProvider,
  handleListModelProviders,
  handleSaveModelProvider,
  handleTestModelProvider,
} from '@/network/actions/model-configuration.actions';

export async function fetchModelConfiguration(projectId: string): Promise<ModelConfigurationBundle> {
  return mapModelConfigurationResponse(await handleListModelProviders(projectId));
}

/** Saved config for one provider, without live model probes. */
export async function fetchProviderConfig(projectId: string, provider: ModelProviderKey): Promise<ProviderConfig | null> {
  const bundle = mapModelConfigurationResponse(await handleListModelProviders(projectId, { live: false }));
  return bundle.providers.find((entry) => entry.key === provider)?.config ?? null;
}

export async function saveProviderConfig(
  projectId: string,
  provider: ModelProviderKey,
  payload: ProviderConfigSavePayload,
): Promise<ProviderConfig> {
  return mapProviderConfig(await handleSaveModelProvider(provider, payload, projectId), provider);
}

export async function testProviderConnection(
  projectId: string,
  provider: ModelProviderKey,
  payload: ProviderTestPayload,
): Promise<ProviderConnectionResult> {
  const data = await handleTestModelProvider(provider, payload, projectId);
  return formatSplitConnectionTestResult(data, { embeddingModel: payload.embedding_model ?? undefined });
}

export async function removeProviderConfig(projectId: string, provider: ModelProviderKey): Promise<boolean> {
  const result = await handleDeleteModelProvider(provider, projectId);
  return Boolean(result?.deleted);
}
