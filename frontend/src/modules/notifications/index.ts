/** Public entry for notifications frontend contributions. */
export { NotificationScreen } from '@/features/notifications/screens/NotificationScreen';

import { registerModule } from '@/platform/modules/registry';

export function registerNotificationsModule(): void {
  registerModule({
    id: 'notifications',
    version: '1.0.0',
    edition: 'community',
    status: 'migrated',
    navigation: [
      {
        route: 'notifications',
        labelKey: 'notifications.title',
        section: 'application',
      },
    ],
  });
}
