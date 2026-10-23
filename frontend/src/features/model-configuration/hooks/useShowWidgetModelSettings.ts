import { useConfiguredProviders } from '@/features/model-configuration/hooks/useConfiguredProviders';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';

/**
 * Whether Chatbot/Search Settings should show the Model Settings section.
 * Members without Model Configuration access only see it once a provider exists.
 */
export function useShowWidgetModelSettings(): boolean {
  const { hasPermission } = useActiveProject();
  const { configured, loading } = useConfiguredProviders();
  const canManageModelConfig = hasPermission('model_configuration:read');

  if (canManageModelConfig) return true;
  if (loading) return false;
  return configured.length > 0;
}
