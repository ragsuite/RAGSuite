import React from 'react';
import { View } from 'react-native';

import type { TrustLocale } from '@/features/trust-center/content';
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';

const TRUST_DOCUMENT_LOCALES: TrustLocale[] = ['en', 'de'];

type Props = {
  value: TrustLocale;
  onChange: (locale: TrustLocale) => void;
};

export function TrustDocumentLocalePicker({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1, minWidth: 200 }}>
      <AppSelectField
        label={t('trustCenter.documentLocale.label')}
        value={value}
        options={TRUST_DOCUMENT_LOCALES.map((locale) => ({
          key: locale,
          label: t(`trustCenter.documentLocale.${locale}`),
        }))}
        onChange={onChange}
        variant="inline"
        accessibilityLabel={t('trustCenter.documentLocale.label')}
      />
    </View>
  );
}
