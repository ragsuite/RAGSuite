import React, { useMemo } from 'react';

import { AppSelectField } from '@/shared/components/app-select-field';
import { PAGE_SIZE_OPTIONS, type PageSizeOption } from '@/shared/constants/pagination';

/** Fits three-digit page sizes (100) + chevron without truncation. */
export const PAGINATION_PAGE_SIZE_CONTROL_WIDTH = 80;

type Props = {
  value: PageSizeOption;
  onChange: (value: PageSizeOption) => void;
  controlHeight: number;
  label: string;
  pickerTitle: string;
};

/**
 * Rows-per-page picker tuned for pagination footers: matched trigger/menu width,
 * centered numeric options, highlight-only selection (no checkmark).
 */
export function PaginationPageSizeSelect({
  value,
  onChange,
  controlHeight,
  label,
  pickerTitle,
}: Props) {
  const options = useMemo(
    () =>
      PAGE_SIZE_OPTIONS.map((size) => ({
        key: String(size) as `${PageSizeOption}`,
        label: String(size),
      })),
    [],
  );

  return (
    <AppSelectField
      label={label}
      accessibilityLabel={label}
      variant="inline"
      pickerTitle={pickerTitle}
      value={String(value) as `${PageSizeOption}`}
      options={options}
      onChange={(next) => onChange(Number.parseInt(next, 10) as PageSizeOption)}
      controlHeight={controlHeight}
      inlineMinWidth={PAGINATION_PAGE_SIZE_CONTROL_WIDTH}
      menuWidth={PAGINATION_PAGE_SIZE_CONTROL_WIDTH}
      menuLockWidth
      menuVariant="numeric"
    />
  );
}
