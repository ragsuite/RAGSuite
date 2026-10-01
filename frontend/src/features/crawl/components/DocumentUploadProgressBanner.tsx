import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { DocumentUploadProgress } from '@/features/crawl/providers/document-upload-progress-provider';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  progress: DocumentUploadProgress;
};

export function DocumentUploadProgressBanner({ progress }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.banner,
        {
          borderColor: `${colors.primary}55`,
          backgroundColor: `${colors.primary}12`,
          borderRadius: surfaceRadius.card,
          padding: spacing.sm,
        },
      ]}>
      <ActivityIndicator size="small" color={colors.primary} />
      <View style={styles.body}>
        <Text style={[typography.caption, { color: colors.primary, fontWeight: '500' }]}>
          {t('documents.uploadInProgressTitle')}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('documents.uploadInProgressBody', { done: progress.done, total: progress.total })}
          {progress.failed > 0 ? ` ${t('documents.uploadFailedSoFar', { count: progress.failed })}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
  },
  body: {
    flex: 1,
    gap: 2,
  },
});
