import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { ProviderFieldInfo } from '@/features/model-configuration/components/ProviderFieldInfo';
import { useTranslation } from '@/i18n';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { parsePdfPageField, type ExtractRangeUnit } from '@/features/crawl/utils/document-form';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  pageFrom: number | null | undefined;
  pageTo: number | null | undefined;
  stripHeader: boolean;
  stripFooter: boolean;
  extractEngine?: 'native' | 'docling';
  showRange?: boolean;
  showStrip?: boolean;
  showEngine?: boolean;
  rangeUnit?: ExtractRangeUnit;
  disabled?: boolean;
  onChange: (patch: {
    pdfPageFrom?: number | null;
    pdfPageTo?: number | null;
    pdfStripHeader?: boolean;
    pdfStripFooter?: boolean;
    pdfStripChrome?: boolean;
    extractEngine?: 'native' | 'docling';
  }) => void;
};

const RANGE_COPY: Record<
  ExtractRangeUnit,
  { from: string; to: string; title: string; helper: string }
> = {
  page: {
    from: 'documents.form.pdfPageFrom',
    to: 'documents.form.pdfPageTo',
    title: 'documents.form.pdfPageRange',
    helper: 'documents.form.pdfPageRangeHelper',
  },
  slide: {
    from: 'documents.form.rangeFromSlide',
    to: 'documents.form.rangeToSlide',
    title: 'documents.form.rangeSlide',
    helper: 'documents.form.rangeHelperSlide',
  },
  sheet: {
    from: 'documents.form.rangeFromSheet',
    to: 'documents.form.rangeToSheet',
    title: 'documents.form.rangeSheet',
    helper: 'documents.form.rangeHelperSheet',
  },
  mixed: {
    from: 'documents.form.rangeFromMixed',
    to: 'documents.form.rangeToMixed',
    title: 'documents.form.rangeMixed',
    helper: 'documents.form.rangeHelperMixed',
  },
};

export function DocumentPdfExtractFields({
  pageFrom,
  pageTo,
  stripHeader,
  stripFooter,
  extractEngine = 'native',
  showRange = true,
  showStrip = true,
  showEngine = false,
  rangeUnit = 'page',
  disabled = false,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const [fromText, setFromText] = useState(pageFrom != null ? String(pageFrom) : '');
  const [toText, setToText] = useState(pageTo != null ? String(pageTo) : '');
  const rangeCopy = RANGE_COPY[rangeUnit];

  useEffect(() => {
    setFromText(pageFrom != null ? String(pageFrom) : '');
  }, [pageFrom]);

  useEffect(() => {
    setToText(pageTo != null ? String(pageTo) : '');
  }, [pageTo]);

  if (!showRange && !showStrip && !showEngine) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      {showEngine ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={[typography.fieldLabel, { color: colors.text, flexShrink: 1 }]}>
              {t('documents.form.extractEngine')}
            </Text>
            <ProviderFieldInfo
              titleKey="documents.form.extractEngine"
              bodyKey="documents.form.extractEngineHelper"
            />
          </View>
          <CrawlSegmentTabs
            appearance="pill"
            variant="secondary"
            tabs={[
              { key: 'native', label: t('documents.form.extractEngineNative') },
              { key: 'docling', label: t('documents.form.extractEngineDocling') },
            ]}
            activeTab={extractEngine}
            onChange={(key) => onChange({ extractEngine: key === 'docling' ? 'docling' : 'native' })}
          />
        </View>
      ) : null}
      {showRange ? (
        <View style={styles.pageRow}>
          <View style={styles.pageField}>
            <AppTextField
              label={t(rangeCopy.from)}
              labelAccessory={<ProviderFieldInfo titleKey={rangeCopy.title} bodyKey={rangeCopy.helper} />}
              value={fromText}
              onChangeText={(next) => {
                setFromText(next);
                onChange({ pdfPageFrom: parsePdfPageField(next) });
              }}
              placeholder={t('documents.form.pdfPageFromPlaceholder')}
              keyboardType="number-pad"
              editable={!disabled}
            />
          </View>
          <View style={styles.pageField}>
            <AppTextField
              label={t(rangeCopy.to)}
              value={toText}
              onChangeText={(next) => {
                setToText(next);
                onChange({ pdfPageTo: parsePdfPageField(next) });
              }}
              placeholder={t('documents.form.pdfPageToPlaceholder')}
              keyboardType="number-pad"
              editable={!disabled}
            />
          </View>
        </View>
      ) : null}
      {showStrip ? (
        <>
          <AppSwitchRow
            label={t('documents.form.pdfStripHeader')}
            labelAccessory={
              <ProviderFieldInfo
                titleKey="documents.form.pdfStripHeader"
                bodyKey="documents.form.pdfStripHeaderHelper"
              />
            }
            value={stripHeader}
            onChange={(pdfStripHeader) =>
              onChange({ pdfStripHeader, pdfStripChrome: pdfStripHeader || stripFooter })
            }
            disabled={disabled}
          />
          <AppSwitchRow
            label={t('documents.form.pdfStripFooter')}
            labelAccessory={
              <ProviderFieldInfo
                titleKey="documents.form.pdfStripFooter"
                bodyKey="documents.form.pdfStripFooterHelper"
              />
            }
            value={stripFooter}
            onChange={(pdfStripFooter) =>
              onChange({ pdfStripFooter, pdfStripChrome: stripHeader || pdfStripFooter })
            }
            disabled={disabled}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pageRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pageField: {
    flex: 1,
    minWidth: 0,
  },
});
