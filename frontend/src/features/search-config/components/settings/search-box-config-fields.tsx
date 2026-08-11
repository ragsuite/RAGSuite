import React from 'react';
import { Scan, Search, Sparkles } from 'lucide-react-native';

import type {
  SearchBoxConfig,
  SearchBoxCustomization,
  SearchBoxIcon,
} from '@/features/search-config/types/search-config.types';
import { SEARCH_BOX_ICON_OPTIONS } from '@/features/search-config/utils/search-box-config-options';
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppColorField } from '@/shared/components/app-color-field';

export function SearchIconGlyph({
  type,
  color,
  size = 18,
}: {
  type: SearchBoxIcon;
  color: string;
  size?: number;
}) {
  if (type === 'scan') return <Scan size={size} color={color} />;
  if (type === 'sparkles') return <Sparkles size={size} color={color} />;
  return <Search size={size} color={color} />;
}

export function SearchIconSelectField({
  value,
  onChange,
}: {
  value: SearchBoxIcon;
  onChange: (icon: SearchBoxIcon) => void;
}) {
  const { t } = useTranslation();

  return (
    <AppSelectField
      label={t('search.config.iconLabel')}
      value={value}
      options={SEARCH_BOX_ICON_OPTIONS}
      onChange={onChange}
      pickerTitle={t('search.config.icon.pickerTitle')}
    />
  );
}

export function BackgroundColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const trimmed = value.trim();
  const normalizedValue = trimmed.startsWith('#') ? trimmed : trimmed ? `#${trimmed}` : '';

  return (
    <AppColorField
      label={t('search.config.backgroundLabel')}
      value={normalizedValue}
      onChange={(hex) => {
        const t = hex.trim();
        if (!t) return onChange('');
        onChange(t.startsWith('#') ? t : `#${t}`);
      }}
      pickerTriggerPlacement="inline"
    />
  );
}

export function searchIconWorksInField(
  _config: SearchBoxConfig,
  customization?: SearchBoxCustomization | null,
) {
  const formType = customization?.searchFormType ?? 'default';
  return formType === 'default';
}

export function searchIconAppliesToButton(customization?: SearchBoxCustomization | null) {
  const formType = customization?.searchFormType ?? 'with-button';
  const buttonType = customization?.buttonType ?? 'search-icon';
  return formType === 'with-button' && buttonType === 'search-icon';
}
