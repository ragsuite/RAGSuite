import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import {
  DELIMITER_PRESET_ORDER,
  emptySplitConfig,
  type DelimiterPreset,
  type SplitConfigForm,
  type SplitSourceKind,
  type TableContext,
} from '@/features/crawl/utils/split-config';
import { ProviderFieldInfo } from '@/features/model-configuration/components/ProviderFieldInfo';
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  kind: SplitSourceKind;
  value: SplitConfigForm;
  disabled?: boolean;
  showExcelAsHtml?: boolean;
  onChange: (next: SplitConfigForm) => void;
};

function parseCount(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function SplittingMethodFields({
  kind,
  value,
  disabled = false,
  showExcelAsHtml = false,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const defaults = emptySplitConfig(kind);
  const [sizeText, setSizeText] = useState(String(value.chunkSize));
  const [overlapText, setOverlapText] = useState(String(value.chunkOverlap));

  useEffect(() => {
    setSizeText(String(value.chunkSize));
  }, [value.chunkSize]);

  useEffect(() => {
    setOverlapText(String(value.chunkOverlap));
  }, [value.chunkOverlap]);

  const patch = (next: Partial<SplitConfigForm>) => onChange({ ...value, ...next });

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={[typography.fieldLabel, { color: colors.text, flexShrink: 1 }]}>
            {t('documents.form.splitMethod')}
          </Text>
          <ProviderFieldInfo titleKey="documents.form.splitMethod" bodyKey="documents.form.splitMethodHelper" />
        </View>
        <CrawlSegmentTabs
          appearance="pill"
          variant="secondary"
          tabs={[
            { key: 'native', label: t('documents.form.splitMethodNative') },
            { key: 'custom', label: t('documents.form.splitMethodCustom') },
          ]}
          activeTab={value.splitMode}
          onChange={(key) =>
            patch({
              splitMode: key === 'custom' ? 'custom' : 'native',
              chunkSize: value.chunkSize || defaults.chunkSize,
              chunkOverlap: value.chunkOverlap || defaults.chunkOverlap,
            })
          }
        />
      </View>
      {value.splitMode === 'custom' ? (
        <View style={{ gap: spacing.sm }}>
          <AppTextField
            label={t('documents.form.chunkSize')}
            labelAccessory={
              <ProviderFieldInfo
                titleKey="documents.form.chunkSize"
                bodyKey="documents.form.chunkSizeHelper"
              />
            }
            value={sizeText}
            onChangeText={(next) => {
              setSizeText(next);
              patch({ chunkSize: parseCount(next, defaults.chunkSize) });
            }}
            keyboardType="number-pad"
            editable={!disabled}
            placeholder={String(defaults.chunkSize)}
          />
          <AppTextField
            label={t('documents.form.chunkOverlap')}
            labelAccessory={
              <ProviderFieldInfo
                titleKey="documents.form.chunkOverlap"
                bodyKey="documents.form.chunkOverlapHelper"
              />
            }
            value={overlapText}
            onChangeText={(next) => {
              setOverlapText(next);
              patch({ chunkOverlap: parseCount(next, defaults.chunkOverlap) });
            }}
            keyboardType="number-pad"
            editable={!disabled}
            placeholder={String(defaults.chunkOverlap)}
          />
          <AppSelectField
            label={t('documents.form.splitAt')}
            labelAccessory={
              <ProviderFieldInfo titleKey="documents.form.splitAt" bodyKey="documents.form.splitAtHelper" />
            }
            value={value.delimiterPreset}
            pickerPresentation="inline"
            options={DELIMITER_PRESET_ORDER.map((key) => ({
              key,
              label: t(`documents.form.splitAt.${key}`),
            }))}
            onChange={(delimiterPreset) => patch({ delimiterPreset: delimiterPreset as DelimiterPreset })}
          />
          {value.delimiterPreset === 'custom' ? (
            <AppTextField
              label={t('documents.form.splitAtCustom')}
              value={value.delimiterCustom}
              onChangeText={(delimiterCustom) => patch({ delimiterCustom: delimiterCustom.slice(0, 20) })}
              editable={!disabled}
              placeholder={t('documents.form.splitAtCustomPlaceholder')}
              maxLength={20}
            />
          ) : null}
          <AppSwitchRow
            label={t('documents.form.splitParentChild')}
            labelAccessory={
              <ProviderFieldInfo
                titleKey="documents.form.splitParentChild"
                bodyKey="documents.form.splitParentChildHelper"
              />
            }
            value={Boolean(value.parentChild)}
            onChange={(parentChild) => patch({ parentChild })}
            disabled={disabled}
            bordered={false}
            transparentBackground
          />
          {kind === 'document' || kind === 'web' ? (
            <AppSelectField
              label={t('documents.form.splitTableContext')}
              labelAccessory={
                <ProviderFieldInfo
                  titleKey="documents.form.splitTableContext"
                  bodyKey="documents.form.splitTableContextHelper"
                />
              }
              value={String(value.tableContext ?? 0) as '0' | '1' | '2'}
              pickerPresentation="inline"
              options={[
                { key: '0', label: t('documents.form.splitTableContext.none') },
                { key: '1', label: t('documents.form.splitTableContext.1') },
                { key: '2', label: t('documents.form.splitTableContext.2') },
              ]}
              onChange={(next) => patch({ tableContext: Number(next) as TableContext })}
            />
          ) : null}
          {kind === 'document' && showExcelAsHtml ? (
            <AppSwitchRow
              label={t('documents.form.splitExcelHtml')}
              labelAccessory={
                <ProviderFieldInfo
                  titleKey="documents.form.splitExcelHtml"
                  bodyKey="documents.form.splitExcelHtmlHelper"
                />
              }
              value={Boolean(value.excelAsHtml)}
              onChange={(excelAsHtml) => patch({ excelAsHtml })}
              disabled={disabled}
              bordered={false}
              transparentBackground
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
