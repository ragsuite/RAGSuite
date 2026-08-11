import React from 'react';

import type { SelectOption } from '@/features/settings/types/settings.types';
import { AppSelectField } from '@/shared/components/app-select-field';

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

export function RegionSelector({ label, value, options, onChange }: Props) {
  return (
    <AppSelectField
      label={label}
      value={value}
      options={options.map((option) => ({ key: option.value, label: option.label }))}
      onChange={onChange}
      placeholder={`Select ${label.toLowerCase()}`}
      accessibilityLabel={label}
    />
  );
}
