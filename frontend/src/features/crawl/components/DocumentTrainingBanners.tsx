import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Idle documents that still need a Train (never trained) or Retrain (other model) action. */
export function DocumentTrainingNeedsNotice({ train, retrain }: { train: number; retrain: number }) {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  if (train === 0 && retrain === 0) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: surfaceRadius.button,
          padding: spacing.sm,
        },
      ]}>
      {train > 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t(train === 1 ? 'documents.coverage.untrainedBanner' : 'documents.coverage.untrainedBannerPlural', {
            count: train,
          })}
        </Text>
      ) : null}
      {retrain > 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t(retrain === 1 ? 'documents.coverage.missingBanner' : 'documents.coverage.missingBannerPlural', {
            count: retrain,
          })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    gap: 6,
  },
});
