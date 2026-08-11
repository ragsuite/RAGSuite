/**
 * Public entry for documents frontend contributions.
 * Document UI currently lives under features/crawl (shared shell); Phase 3 exposes
 * it only through this module entry so other modules do not import crawl internals.
 */
export { CrawlDocumentPanel } from '@/features/crawl/components/CrawlDocumentPanel';
export { DocumentDetailPanel } from '@/features/crawl/components/DocumentDetailPanel';

import { registerModule } from '@/platform/modules/registry';

export function registerDocumentsModule(): void {
  registerModule({
    id: 'documents',
    version: '1.0.0',
    edition: 'community',
    status: 'migrated',
    navigation: [
      {
        route: 'documents',
        labelKey: 'nav.documents',
        section: 'application',
      },
    ],
    permissions: ['documents:read', 'documents:write'],
  });
}
