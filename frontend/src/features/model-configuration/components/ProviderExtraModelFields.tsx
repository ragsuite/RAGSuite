import React from 'react';
import { View } from 'react-native';

import { ProviderFieldInfo } from '@/features/model-configuration/components/ProviderFieldInfo';
import type { ExtraProviderKind, ProviderCatalogEntry } from '@/features/model-configuration/types/model-configuration.types';
import { EXTRA_PROVIDER_KINDS } from '@/features/model-configuration/types/model-configuration.types';
import { providerHasKind, resolveExtraModelOptions } from '@/features/model-configuration/utils/provider-catalog';
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';

type Props = {
  entry: ProviderCatalogEntry;
  values: Record<ExtraProviderKind, string>;
  onChange: (kind: ExtraProviderKind, value: string) => void;
};

export function ProviderExtraModelFields({ entry, values, onChange }: Props) {
  const { t } = useTranslation();
  const fields = EXTRA_PROVIDER_KINDS.filter((kind) => providerHasKind(entry, kind));
  if (fields.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {fields.map((kind) => (
        <AppSelectField
          key={kind}
          label={t(`modelConfiguration.filter.${kind}`)}
          labelAccessory={
            <ProviderFieldInfo
              titleKey={`modelConfiguration.${kind}Model.hintTitle`}
              bodyKey={`modelConfiguration.${kind}Model.hintBody`}
            />
          }
          value={values[kind]}
          options={resolveExtraModelOptions(
            entry,
            kind,
            values[kind],
            t('modelConfiguration.nativeDefault'),
          )}
          onChange={(value) => onChange(kind, value)}
        />
      ))}
    </View>
  );
}
