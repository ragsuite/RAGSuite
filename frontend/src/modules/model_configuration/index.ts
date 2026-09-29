/** Public entry for model_configuration frontend contributions. */
export { ModelConfigurationScreen } from '@/features/model-configuration/screens/ModelConfigurationScreen';

import { registerModule } from '@/platform/modules/registry';

export function registerModelConfigurationModule(): void {
  registerModule({
    id: 'model_configuration',
    version: '1.0.0',
    edition: 'community',
    status: 'migrated',
    navigation: [
      {
        route: 'model-configuration',
        labelKey: 'nav.model-configuration',
        section: 'application',
      },
    ],
    permissions: ['chatbot:settings', 'search:settings'],
  });
}
