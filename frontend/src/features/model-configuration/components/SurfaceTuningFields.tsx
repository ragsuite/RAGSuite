import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ProviderFieldInfo } from '@/features/model-configuration/components/ProviderFieldInfo';
import type {
  ModelProviderKey,
  SurfaceTuningDraft,
  TuningSurface,
} from '@/features/model-configuration/types/model-configuration.types';
import {
  MAX_TOKENS_LIMITS,
  maxTemperatureFor,
  SIMILARITY_THRESHOLD_LIMITS,
  TEMPERATURE_STEP,
} from '@/features/model-configuration/utils/provider-surface-tuning';
import { useTranslation } from '@/i18n';
import { AppRangeField } from '@/shared/components/app-range-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  provider: ModelProviderKey;
  surface: TuningSurface;
  value: SurfaceTuningDraft;
  onChange: (patch: Partial<SurfaceTuningDraft>) => void;
  maxTokensHelper?: string;
};

const LABEL_PREFIX: Record<TuningSurface, 'chatbot' | 'search'> = { chat: 'chatbot', search: 'search' };

/** Temperature, similarity threshold and max tokens for one widget surface. */
export function SurfaceTuningFields({ provider, surface, value, onChange, maxTokensHelper }: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const prefix = LABEL_PREFIX[surface];
  const temperatureLabel = t(`${prefix}.models.parameters.temperature`);
  const similarityLabel = t(`${prefix}.models.rag.similarityThreshold`);
  const maxTokensLabel = t(`${prefix}.models.rag.maxTokens`);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.fieldGroup}>
        <AppRangeField
          label={temperatureLabel}
          labelAccessory={
            <ProviderFieldInfo
              title={temperatureLabel}
              body={t('modelConfiguration.temperature.helper')}
            />
          }
          value={value.temperature}
          min={0}
          max={maxTemperatureFor(provider)}
          step={TEMPERATURE_STEP}
          formatValue={(v) => v.toFixed(1)}
          onChange={(temperature) => onChange({ temperature })}
        />
      </View>

      <View style={styles.fieldGroup}>
        <AppRangeField
          label={similarityLabel}
          labelAccessory={
            <ProviderFieldInfo
              title={similarityLabel}
              body={t(`${prefix}.models.rag.similarityThresholdHelper`)}
            />
          }
          value={value.similarityThreshold}
          {...SIMILARITY_THRESHOLD_LIMITS[surface]}
          formatValue={(v) => v.toFixed(2)}
          onChange={(similarityThreshold) => onChange({ similarityThreshold })}
        />
      </View>

      <View style={styles.fieldGroup}>
        <AppRangeField
          label={maxTokensLabel}
          labelAccessory={
            maxTokensHelper ? (
              <ProviderFieldInfo title={maxTokensLabel} body={maxTokensHelper} />
            ) : undefined
          }
          value={value.maxTokens}
          {...MAX_TOKENS_LIMITS[surface]}
          formatValue={(v) => String(v)}
          onChange={(maxTokens) => onChange({ maxTokens })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 4 },
});
