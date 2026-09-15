/** Public entry for ai_assistant frontend contributions. */
export { AiAssistantScreen } from '@/features/ai-assistant/screens/AiAssistantScreen';
export { AiAssistantSettingsScreen } from '@/features/ai-assistant/screens/AiAssistantSettingsScreen';

import { registerModule } from '@/platform/modules/registry';

export function registerAiAssistantModule(): void {
  registerModule({
    id: 'ai_assistant',
    version: '1.0.0',
    edition: 'community',
    status: 'migrated',
    navigation: [
      {
        route: 'ai-assistant',
        labelKey: 'nav.ai-assistant',
        section: 'application',
      },
    ],
    permissions: ['ai_assistant:use', 'ai_assistant:settings'],
  });
}
