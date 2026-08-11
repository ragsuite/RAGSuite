import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  count: number;
  saving: boolean;
  onReindex: () => void;
  onDelete: () => void;
  onClear?: () => void;
};

export function DocumentBulkActionBar({ count, saving, onReindex, onDelete, onClear }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius, isWebParitySurfaces, typography } = useAppTheme();
  const barRadius = surfaceRadius.card;

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
      <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1 }]}>
        {count === 1
          ? t('documents.bulk.selectedCountOne', { count })
          : t('documents.bulk.selectedCountMany', { count })}
      </Text>
      <View style={[styles.actions, { gap: spacing.xs }]}>
        <ConfigurationOutlineButton label={t('documents.bulk.reindex')} loading={saving} onPress={onReindex} />
        <AppButton label={t('common.delete')} loading={saving} onPress={onDelete} variant="danger" size="compact" />
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
