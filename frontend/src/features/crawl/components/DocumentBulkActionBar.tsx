import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import type { DocumentTrainingMode } from '@/features/crawl/types/crawl.types';
import { trainingActionLabelKey } from '@/features/crawl/utils/document-training-status';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  count: number;
  trainMode: DocumentTrainingMode;
  /** Selected documents that are already training; they are skipped. */
  activeCount: number;
  /** Train / Retrain request in flight — only that button shows a spinner. */
  trainingStarting: boolean;
  /** Another save (upload, delete…) is running; actions stay disabled without spinning. */
  busy: boolean;
  onTrain: () => void;
  onDelete: () => void;
  onClear?: () => void;
};

export function DocumentBulkActionBar({
  count,
  trainMode,
  activeCount,
  trainingStarting,
  busy,
  onTrain,
  onDelete,
  onClear,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const barRadius = surfaceRadius.card;
  const allActive = activeCount >= count;

  return (
    <View
      style={[
        styles.bar,
        {
          borderRadius: barRadius,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        },
      ]}>
      <View style={styles.summary}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
          {count === 1
            ? t('documents.bulk.selectedCountOne', { count })
            : t('documents.bulk.selectedCountMany', { count })}
        </Text>
        {activeCount > 0 ? (
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t('documents.bulk.alreadyTraining', { count: activeCount })}
          </Text>
        ) : null}
      </View>
      <View style={[styles.actions, { gap: spacing.xs }]}>
        <ConfigurationOutlineButton
          label={t(trainingActionLabelKey(trainMode))}
          loading={trainingStarting}
          disabled={allActive || busy}
          onPress={onTrain}
        />
        <AppButton
          label={t('common.delete')}
          disabled={busy || trainingStarting}
          onPress={onDelete}
          variant="danger"
          size="compact"
        />
        {onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('documents.bulk.clearSelection')}
            onPress={onClear}
            hitSlop={8}
            style={({ pressed }) => [
              styles.clearBtn,
              {
                borderRadius: surfaceRadius.button,
                backgroundColor: pressed ? colors.border : 'transparent',
              },
            ]}>
            <X size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    borderWidth: 1,
  },
  summary: {
    flex: 1,
    gap: 2,
    minWidth: 160,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  clearBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
