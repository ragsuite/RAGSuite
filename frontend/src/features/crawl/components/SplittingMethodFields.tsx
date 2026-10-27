import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import {
  DELIMITER_PRESET_ORDER,
  DELIMITER_PRESET_SIGNS,
  emptySplitConfig,
  type DelimiterPreset,
  type SplitConfigForm,
  type SplitSourceKind,
} from '@/features/crawl/utils/split-config';
import { ProviderFieldInfo } from '@/features/model-configuration/components/ProviderFieldInfo';
import { useTranslation } from '@/i18n';
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
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

function selectedPresets(value: SplitConfigForm): DelimiterPreset[] {
  return value.delimiterPresets?.length ? value.delimiterPresets : [value.delimiterPreset];
}

export function SplittingMethodFields({
  kind,
  value,
  disabled = false,
  showExcelAsHtml = false,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, radius } = useAppTheme();
  const defaults = emptySplitConfig(kind);
  const [sizeText, setSizeText] = useState(String(value.chunkSize));
  const [overlapText, setOverlapText] = useState(String(value.chunkOverlap));
  const checked = selectedPresets(value);

  useEffect(() => {
    setSizeText(String(value.chunkSize));
  }, [value.chunkSize]);

  useEffect(() => {
    setOverlapText(String(value.chunkOverlap));
  }, [value.chunkOverlap]);

  const patch = (next: Partial<SplitConfigForm>) => onChange({ ...value, ...next });

  const togglePreset = (key: DelimiterPreset) => {
    if (disabled) return;
    const has = checked.includes(key);
    if (has) {
      if (checked.length === 1) return;
      const next = checked.filter((item) => item !== key);
      patch({ delimiterPresets: next, delimiterPreset: next[0] });
      return;
    }
    const next = DELIMITER_PRESET_ORDER.filter((item) => item === key || checked.includes(item));
    patch({ delimiterPresets: next, delimiterPreset: next[0] });
  };

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
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={[typography.fieldLabel, { color: colors.text, flexShrink: 1 }]}>
                {t('documents.form.splitAt')}
              </Text>
              <ProviderFieldInfo titleKey="documents.form.splitAt" bodyKey="documents.form.splitAtHelper" />
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.sm,
                backgroundColor: colors.surface,
              }}
            >
              {DELIMITER_PRESET_ORDER.map((key, index) => {
                const isChecked = checked.includes(key);
                const sign = key === 'custom' ? null : DELIMITER_PRESET_SIGNS[key];
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked, disabled }}
                    disabled={disabled}
                    onPress={() => togglePreset(key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      minHeight: 44,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 10,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <AppCheckboxMark checked={isChecked} />
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                      {t(`documents.form.splitAt.${key}`)}
                    </Text>
                    {sign ? (
                      <Text style={[typography.citation, { color: colors.textMuted }]}>{sign}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
          {checked.includes('custom') ? (
            <AppTextField
              label={t('documents.form.splitAtCustom')}
              labelAccessory={
                <ProviderFieldInfo
                  titleKey="documents.form.splitAtCustom"
                  bodyKey="documents.form.splitAtCustomHelper"
                />
              }
              value={value.delimiterCustom}
              onChangeText={(delimiterCustom) => patch({ delimiterCustom: delimiterCustom.slice(0, 200) })}
              editable={!disabled}
              placeholder={t('documents.form.splitAtCustomPlaceholder')}
              maxLength={200}
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
            <AppSwitchRow
              label={t('documents.form.splitTableContext')}
              labelAccessory={
                <ProviderFieldInfo
                  titleKey="documents.form.splitTableContext"
                  bodyKey="documents.form.splitTableContextHelper"
                />
              }
              value={(value.tableContext ?? 0) > 0}
              onChange={(on) => patch({ tableContext: on ? 2 : 0 })}
              disabled={disabled}
              bordered={false}
              transparentBackground
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
