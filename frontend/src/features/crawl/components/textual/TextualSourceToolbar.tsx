import React from 'react';

import { CrawlFilterSelect } from '@/features/crawl/components/CrawlFilterSelect';
import { CrawlMobileFilterSection } from '@/features/crawl/components/CrawlMobileFilterSection';
import { CrawlSearchField } from '@/features/crawl/components/CrawlSearchField';
import { useDocumentStatusOptions } from '@/features/crawl/hooks/use-document-status-options';
import {
  countActiveSourceListFilters,
  type SourceListFilters,
} from '@/features/crawl/utils/document-filter-utils';
import { useTranslation } from '@/i18n';

type Props = {
  filters: SourceListFilters;
  searchPlaceholder: string;
  onChange: (filters: SourceListFilters) => void;
};

/** Search + status toolbar for the Text and Q&A Pairs tabs (same controls as the Document tab). */
export function TextualSourceToolbar({ filters, searchPlaceholder, onChange }: Props) {
  const { t } = useTranslation();
  const statusOptions = useDocumentStatusOptions();

  return (
    <CrawlMobileFilterSection
      activeFilterCount={countActiveSourceListFilters(filters)}
      accessibilityLabel={t('common.filter')}
      search={
        <CrawlSearchField
          value={filters.query}
          onChangeText={(query) => onChange({ ...filters, query })}
          placeholder={searchPlaceholder}
          accessibilityLabel={searchPlaceholder}
        />
      }
      filters={
        <CrawlFilterSelect
          accessibilityLabel={t('documents.filters.status')}
          value={filters.status}
          options={statusOptions}
          onChange={(status) => onChange({ ...filters, status })}
        />
      }
    />
  );
}
