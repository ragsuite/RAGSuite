import { registerDocumentsModule } from '@/modules/documents';
import { registerNotificationsModule } from '@/modules/notifications';
import { registerSystemHealthModule } from '@/modules/system_health';

/** Register all migrated Community modules (explicit list — Phase 3). */
export function loadCommunityModules(): void {
  registerSystemHealthModule();
  registerNotificationsModule();
  registerDocumentsModule();
}
