import type { ProviderCatalogEntry } from '@/features/model-configuration/types/model-configuration.types';
import {
  CHAT_ONLY_PROVIDERS,
  toLegacyProviderKey,
  toModelProviderKey,
} from '@/features/model-configuration/utils/model-configuration.mappers';

/** Model fields a widget takes from its project provider config. */
export type WidgetModelFields = {
  provider: string;
  chatModel: string;
  embeddingModel: string;
};

/** The widget's current provider when configured, otherwise the first configured provider. */
export function resolveWidgetProviderEntry(
  widgetProvider: string | null | undefined,
  configured: ProviderCatalogEntry[],
): ProviderCatalogEntry | null {
  const key = toModelProviderKey(widgetProvider);
  return configured.find((p) => p.key === key) ?? configured[0] ?? null;
}

export type UnavailableWidgetProvider = { label: string; reason: 'keyRejected' | 'notConfigured' };

/** The widget's saved provider when it is no longer usable (e.g. its key was rejected). */
export function resolveUnavailableWidgetProvider(
  widgetProvider: string | null | undefined,
  providers: ProviderCatalogEntry[],
): UnavailableWidgetProvider | null {
  const key = toModelProviderKey(widgetProvider);
  const entry = key ? providers.find((p) => p.key === key) : undefined;
  if (!entry || entry.config.configured) return null;
  return { label: entry.label, reason: entry.config.keyRejected ? 'keyRejected' : 'notConfigured' };
}

/**
 * Mirror the provider models into widget settings for display and save. The
 * server fills the same values plus the model-specific tuning from Model
 * Configuration; chat-only providers keep the widget's embedding model.
 */
export function applyProviderToWidgetSettings<T extends WidgetModelFields>(settings: T, entry: ProviderCatalogEntry): T {
  const { config } = entry;
  return {
    ...settings,
    provider: toLegacyProviderKey(entry.key),
    chatModel: config.chatModel || settings.chatModel,
    embeddingModel: CHAT_ONLY_PROVIDERS.has(entry.key)
      ? settings.embeddingModel
      : config.embeddingModel || settings.embeddingModel,
  };
}
