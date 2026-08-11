/** Public entry for system_health frontend contributions. */
export { SystemHealthScreen } from '@/features/system-health/screens/SystemHealthScreen';

import { registerModule } from '@/platform/modules/registry';

export function registerSystemHealthModule(): void {
  registerModule({
    id: 'system_health',
    version: '1.0.0',
    edition: 'community',
    status: 'migrated',
    navigation: [
      {
        route: 'system-health',
        labelKey: 'settings.system-health',
        section: 'management',
      },
    ],
    permissions: ['system_health:read'],
  });
}
