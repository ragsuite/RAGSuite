import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Download, FileText, FileType, Globe, Printer } from 'lucide-react-native';

import { TrustDocumentLocalePicker } from '@/features/trust-center/components/TrustDocumentLocalePicker';
import type { TrustLocale } from '@/features/trust-center/content';
import type { TrustDocument } from '@/features/trust-center/content/types';
import {
  exportTrustDocument,
  type TrustExportFormat,
  type TrustExportResult,
} from '@/features/trust-center/utils/export-trust-document';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: TrustDocument;
  documentLocale: TrustLocale;
  onDocumentLocaleChange: (locale: TrustLocale) => void;
  onFeedback?: (message: string, variant?: 'success' | 'error') => void;
};

type BusyFormat = TrustExportFormat | null;

const FORMAT_BUTTONS: Array<{
  format: TrustExportFormat;
  labelKey: string;
  successKey: string;
  icon: typeof Download;
  variant?: 'secondary' | 'cta';
}> = [
  {
    format: 'markdown',
    labelKey: 'trustCenter.export.markdown',
    successKey: 'trustCenter.export.markdownSuccess',
    icon: Download,
    variant: 'secondary',
  },
  {
    format: 'pdf',
    labelKey: 'trustCenter.export.pdf',
    successKey: 'trustCenter.export.pdfSuccess',
    icon: Printer,
    variant: 'secondary',
  },
  {
    format: 'word',
    labelKey: 'trustCenter.export.word',
    successKey: 'trustCenter.export.wordSuccess',
    icon: FileType,
    variant: 'secondary',
  },
  {
    format: 'html',
    labelKey: 'trustCenter.export.html',
    successKey: 'trustCenter.export.htmlSuccess',
    icon: Globe,
    variant: 'secondary',
  },
  {
    format: 'plainText',
    labelKey: 'trustCenter.export.plainText',
    successKey: 'trustCenter.export.plainTextSuccess',
    icon: FileText,
    variant: 'secondary',
  },
];

function successMessageKey(format: TrustExportFormat, result: TrustExportResult): string {
  if (format === 'pdf' && result === 'shared') {
    return 'trustCenter.export.markdownSuccess';
  }
  const button = FORMAT_BUTTONS.find((item) => item.format === format);
  return button?.successKey ?? 'trustCenter.export.markdownSuccess';
}

export function TrustExportActions({
  document,
  documentLocale,
  onDocumentLocaleChange,
  onFeedback,
}: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const [busy, setBusy] = useState<BusyFormat>(null);

  const handleExport = async (format: TrustExportFormat) => {
    setBusy(format);
    try {
      const result = await exportTrustDocument(document, documentLocale, format);
      onFeedback?.(t(successMessageKey(format, result)), 'success');
    } catch {
      onFeedback?.(t('trustCenter.export.failed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <TrustDocumentLocalePicker value={documentLocale} onChange={onDocumentLocaleChange} />
      {FORMAT_BUTTONS.map(({ format, labelKey, icon, variant = 'secondary' }) => (
        <AppButton
          key={format}
          variant={variant}
          size="compact"
          label={t(labelKey)}
          icon={icon}
          loading={busy === format}
          disabled={busy != null}
          onPress={() => void handleExport(format)}
        />
      ))}
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
