import { registerAiAssistantModule } from '@/modules/ai_assistant';
import { registerDocumentsModule } from '@/modules/documents';
import { registerModelConfigurationModule } from '@/modules/model_configuration';
import { registerNotificationsModule } from '@/modules/notifications';
import { registerSystemHealthModule } from '@/modules/system_health';

/** Register all migrated Community modules (explicit list — Phase 3). */
export function loadCommunityModules(): void {
  registerSystemHealthModule();
  registerNotificationsModule();
  registerDocumentsModule();
  registerAiAssistantModule();
  registerModelConfigurationModule();
}
