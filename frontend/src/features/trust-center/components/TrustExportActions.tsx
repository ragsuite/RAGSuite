import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Download, Printer } from 'lucide-react-native';

import type { TrustDocument } from '@/features/trust-center/content/types';
import {
  exportTrustDocumentMarkdown,
  exportTrustDocumentPdf,
} from '@/features/trust-center/utils/export-trust-document';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: TrustDocument;
  locale: string;
  onFeedback?: (message: string, variant?: 'success' | 'error') => void;
};

export function TrustExportActions({ document, locale, onFeedback }: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const [busy, setBusy] = useState<'md' | 'pdf' | null>(null);

  const handleMarkdown = async () => {
    setBusy('md');
    try {
      await exportTrustDocumentMarkdown(document, locale);
      onFeedback?.(t('trustCenter.export.markdownSuccess'), 'success');
    } catch {
      onFeedback?.(t('trustCenter.export.failed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = async () => {
    setBusy('pdf');
    try {
      const result = await exportTrustDocumentPdf(document, locale);
      onFeedback?.(
        result === 'printed' ? t('trustCenter.export.pdfSuccess') : t('trustCenter.export.markdownSuccess'),
        'success',
      );
    } catch {
      onFeedback?.(t('trustCenter.export.failed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      // @ts-expect-error web data attribute — hide export row when printing
      dataSet={Platform.OS === 'web' ? { trustExport: 'true' } : undefined}
      style={[styles.row, { gap: spacing.sm }]}>
      <AppButton
        variant="secondary"
        size="compact"
        label={t('trustCenter.export.markdown')}
        icon={Download}
        loading={busy === 'md'}
        disabled={busy != null}
        onPress={() => void handleMarkdown()}
      />
      <AppButton
        variant="cta"
        size="compact"
        label={t('trustCenter.export.pdf')}
        icon={Printer}
        loading={busy === 'pdf'}
        disabled={busy != null}
        onPress={() => void handlePdf()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
