import React from 'react';

import type { SelectOption } from '@/features/settings/types/settings.types';
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

export function LanguageSelector({ label, value, options, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <AppSelectField
      label={label}
      value={value}
      options={options.map((option) => ({ key: option.value, label: option.label }))}
      onChange={onChange}
      placeholder={t('common.selectLanguage')}
      accessibilityLabel={label}
    />
  );
}
