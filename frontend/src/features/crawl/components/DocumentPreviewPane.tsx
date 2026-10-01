import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { PptxPreviewPanel } from '@/features/crawl/components/PptxPreviewPanel';
import type { DocumentPreviewContent } from '@/features/crawl/hooks/use-document-preview-content';
import { useTranslation } from '@/i18n';
import { AppHtmlBody } from '@/shared/components/app-html-body';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  content: DocumentPreviewContent;
  title: string;
  downloading: boolean;
  onRetry: () => void;
  onDownload: () => void;
  onPptxError: () => void;
};

export function DocumentPreviewPane({ content, title, downloading, onRetry, onDownload, onPptxError }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const radius = surfaceRadius.card;

  switch (content.type) {
    case 'idle':
    case 'loading':
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('documents.inspector.loading')}</Text>
        </View>
      );
    case 'error':
      return (
        <View style={[styles.centered, { gap: spacing.sm }]}>
          <Text style={[typography.body, { color: colors.danger, textAlign: 'center' }]}>
            {t('documents.inspector.loadFailed')}
          </Text>
          <ConfigurationOutlineButton label={t('common.retry')} onPress={onRetry} />
        </View>
      );
    case 'download-only':
      return (
        <View style={[styles.centered, { gap: spacing.sm }]}>
          <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
            {t(
              content.reason === 'type'
                ? 'documents.inspector.previewUnsupported'
                : 'documents.inspector.previewInlineUnavailable',
            )}
          </Text>
          <ConfigurationOutlineButton
            label={t('documents.inspector.download')}
            icon={ActionIcons.download}
            loading={downloading}
            onPress={onDownload}
          />
        </View>
      );
    case 'text':
      return (
        <AppScrollView style={styles.scroll} contentContainerStyle={{ padding: spacing.md }}>
          <Text style={[styles.mono, { color: colors.text, fontFamily: fonts.mono }]} selectable>
            {content.text}
          </Text>
        </AppScrollView>
      );
    case 'html':
      return (
        <AppScrollView style={styles.scroll} contentContainerStyle={{ padding: spacing.md }}>
          <AppHtmlBody html={content.html} />
        </AppScrollView>
      );
    case 'pptx':
      return (
        <AppScrollView style={styles.scroll} contentContainerStyle={{ padding: spacing.sm }}>
          <PptxPreviewPanel arrayBuffer={content.buffer} onError={onPptxError} />
        </AppScrollView>
      );
    case 'frame':
      if (Platform.OS !== 'web') return null;
      return (
        <View style={styles.frame}>
          <iframe
            src={content.url}
            title={title}
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: radius }}
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  centered: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  scroll: {
    maxHeight: 480,
  },
  mono: {
    fontSize: 13,
    lineHeight: 20,
  },
  frame: {
    height: 480,
    width: '100%',
  },
});
