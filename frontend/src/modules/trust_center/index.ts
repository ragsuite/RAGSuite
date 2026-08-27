/** Public entry for trust_center frontend contributions. */
export { TrustCenterScreen } from '@/features/trust-center/screens/TrustCenterScreen';

import { registerModule } from '@/platform/modules/registry';

export function registerTrustCenterModule(): void {
  registerModule({
    id: 'trust_center',
    version: '1.0.0',
    edition: 'community',
    status: 'migrated',
    navigation: [
      {
        route: 'trust-center',
        labelKey: 'trustCenter.nav',
        section: 'management',
      },
    ],
    permissions: ['trust_center:read'],
  });
}
