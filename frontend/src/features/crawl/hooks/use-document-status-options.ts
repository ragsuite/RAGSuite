import { useMemo } from 'react';

import type { DocumentFilters } from '@/features/crawl/types/crawl.types';
import { useTranslation } from '@/i18n';

export type DocumentStatusOption = { key: DocumentFilters['status']; label: string };

/** Status filter choices shared by the Document, Text and Q&A Pairs toolbars. */
export function useDocumentStatusOptions(): DocumentStatusOption[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { key: 'all', label: t('documents.filters.statusAll') },
      { key: 'indexed', label: t('documents.status.indexed') },
      { key: 'processing', label: t('documents.status.processing') },
      { key: 'error', label: t('documents.status.error') },
    ],
    [t],
  );
}
