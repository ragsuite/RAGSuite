import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { ProviderFieldInfo } from '@/features/model-configuration/components/ProviderFieldInfo';
import { useTranslation } from '@/i18n';
import { AppRangeField } from '@/shared/components/app-range-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import {
  KEYWORD_BLEND_LIMITS,
  namedPresetThreshold,
  RERANK_CANDIDATES_LIMITS,
  THRESHOLD_PRESETS,
  type ThresholdPreset,
} from '@/shared/constants/retrieve-knobs';
import { clampToRange, type SliderRange } from '@/shared/constants/widget-retrieval-limits';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type RetrieveKnobsValue = {
  topKResults: number;
  rerankCandidates: number | null;
  thresholdPreset: ThresholdPreset | null;
  similarityThreshold: number;
  useReranker: boolean;
  keywordBlend: number | null;
};

type Props = {
  value: RetrieveKnobsValue;
  surface: 'chat' | 'search';
  topKRange: SliderRange;
  thresholdRange: SliderRange;
  i18nPrefix: 'chatbot.models.rag' | 'search.models.rag';
  onChange: (patch: Partial<RetrieveKnobsValue>) => void;
};

export function RetrieveKnobsFields({
  value,
  surface,
  topKRange,
  thresholdRange,
  i18nPrefix,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const preset = value.thresholdPreset ?? 'balanced';
  const candidates = value.rerankCandidates ?? RERANK_CANDIDATES_LIMITS.default;
  const minCandidates = Math.max(RERANK_CANDIDATES_LIMITS.min, value.topKResults);

  const setPreset = (next: ThresholdPreset) => {
    const named = namedPresetThreshold(surface, next);
    onChange({
      thresholdPreset: next,
      ...(named != null ? { similarityThreshold: named } : {}),
    });
  };

  return (
    <View style={{ gap: spacing.md }}>
      <AppRangeField
        label={t(`${i18nPrefix}.topK`)}
        labelAccessory={<ProviderFieldInfo titleKey={`${i18nPrefix}.topK`} bodyKey={`${i18nPrefix}.topKHelper`} />}
        value={value.topKResults}
        {...topKRange}
        formatValue={(v) => String(v)}
        onChange={(topKResults) => {
          const nextCandidates =
            value.rerankCandidates != null
              ? Math.max(value.rerankCandidates, topKResults)
              : value.rerankCandidates;
          onChange({ topKResults, rerankCandidates: nextCandidates });
        }}
      />

      <AppRangeField
        label={t(`${i18nPrefix}.rerankCandidates`)}
        labelAccessory={
          <ProviderFieldInfo
            titleKey={`${i18nPrefix}.rerankCandidates`}
            bodyKey={`${i18nPrefix}.rerankCandidatesHelper`}
          />
        }
        value={clampToRange(candidates, { ...RERANK_CANDIDATES_LIMITS, min: minCandidates })}
        min={minCandidates}
        max={RERANK_CANDIDATES_LIMITS.max}
        step={RERANK_CANDIDATES_LIMITS.step}
        formatValue={(v) => String(v)}
        onChange={(rerankCandidates) => onChange({ rerankCandidates: Math.max(rerankCandidates, value.topKResults) })}
      />

      <View style={styles.fieldGroup}>
        <View style={styles.labelRow}>
          <Text style={[typography.fieldLabel, { color: colors.text, flexShrink: 1 }]}>
            {t(`${i18nPrefix}.thresholdPreset`)}
          </Text>
          <ProviderFieldInfo
            titleKey={`${i18nPrefix}.thresholdPreset`}
            bodyKey={`${i18nPrefix}.similarityThresholdHelper`}
          />
        </View>
        <CrawlSegmentTabs
          appearance="pill"
          variant="secondary"
          tabs={THRESHOLD_PRESETS.map((key) => ({ key, label: t(`${i18nPrefix}.preset.${key}`) }))}
          activeTab={preset}
          onChange={(key) => setPreset(key)}
        />
        <AppRangeField
          label={t(`${i18nPrefix}.similarityThreshold`)}
          value={clampToRange(value.similarityThreshold, thresholdRange)}
          {...thresholdRange}
          formatValue={(v) => v.toFixed(2)}
          onChange={(similarityThreshold) =>
            onChange({ similarityThreshold, thresholdPreset: 'custom' })
          }
        />
      </View>

      <AppRangeField
        label={t(`${i18nPrefix}.keywordBlend`)}
        labelAccessory={
          <ProviderFieldInfo
            titleKey={`${i18nPrefix}.keywordBlend`}
            bodyKey={`${i18nPrefix}.keywordBlendHelper`}
          />
        }
        value={clampToRange(value.keywordBlend ?? KEYWORD_BLEND_LIMITS.default, KEYWORD_BLEND_LIMITS)}
        min={KEYWORD_BLEND_LIMITS.min}
        max={KEYWORD_BLEND_LIMITS.max}
        step={KEYWORD_BLEND_LIMITS.step}
        formatValue={(v) => {
          const percent = Math.round(v * 100);
          return t(`${i18nPrefix}.keywordBlendValue`, { percent });
        }}
        onChange={(keywordBlend) => onChange({ keywordBlend })}
      />

      <AppSwitchRow
        bordered
        label={t(`${i18nPrefix}.useReranker`)}
        labelAccessory={
          <ProviderFieldInfo
            titleKey={`${i18nPrefix}.useReranker`}
            bodyKey={`${i18nPrefix}.useRerankerHelper`}
          />
        }
        value={value.useReranker}
        onChange={(useReranker) => onChange({ useReranker })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
