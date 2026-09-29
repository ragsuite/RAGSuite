import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

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

function FieldHint({ children }: { children: string }) {
  const { colors, typography } = useAppTheme();
  return <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{children}</Text>;
}

/** Temperature, similarity threshold and max tokens for one widget surface. */
export function SurfaceTuningFields({ provider, surface, value, onChange, maxTokensHelper }: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const prefix = LABEL_PREFIX[surface];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.fieldGroup}>
        <AppRangeField
          label={t(`${prefix}.models.parameters.temperature`)}
          value={value.temperature}
          min={0}
          max={maxTemperatureFor(provider)}
          step={TEMPERATURE_STEP}
          formatValue={(v) => v.toFixed(1)}
          onChange={(temperature) => onChange({ temperature })}
        />
        <FieldHint>{t('modelConfiguration.temperature.helper')}</FieldHint>
      </View>

      <View style={styles.fieldGroup}>
        <AppRangeField
          label={t(`${prefix}.models.rag.similarityThreshold`)}
          value={value.similarityThreshold}
          {...SIMILARITY_THRESHOLD_LIMITS[surface]}
          formatValue={(v) => v.toFixed(2)}
          onChange={(similarityThreshold) => onChange({ similarityThreshold })}
        />
        <FieldHint>{t(`${prefix}.models.rag.similarityThresholdHelper`)}</FieldHint>
      </View>

      <View style={styles.fieldGroup}>
        <AppRangeField
          label={t(`${prefix}.models.rag.maxTokens`)}
          value={value.maxTokens}
          {...MAX_TOKENS_LIMITS[surface]}
          formatValue={(v) => String(v)}
          onChange={(maxTokens) => onChange({ maxTokens })}
        />
        {maxTokensHelper ? <FieldHint>{maxTokensHelper}</FieldHint> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 4 },
  hint: { lineHeight: 18 },
});
