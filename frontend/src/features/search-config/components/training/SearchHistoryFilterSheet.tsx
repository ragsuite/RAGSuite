import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import type { SearchHistoryTimeRange } from '@/features/search-config/types/search-config.types';
import { getSearchConfigNav } from '@/features/search-config/utils/search-config-nav';
import { useTranslation } from '@/i18n';
import { SEARCH_CONFIG_TOUCH_MIN } from '@/features/search-config/utils/search-config-mobile';
import { AppButton } from '@/shared/components/app-button';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  timeRange: SearchHistoryTimeRange;
  onTimeRangeChange: (value: SearchHistoryTimeRange) => void;
};

export function SearchHistoryFilterSheet({ visible, onClose, timeRange, onTimeRangeChange }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { SEARCH_HISTORY_TIME_RANGE_OPTIONS } = getSearchConfigNav(t);

  return (
    <AdaptiveOverlay
      visible={visible}
      title={t('common.filter')}
      subtitle={t('search.history.filter.placeholder')}
      onClose={onClose}
      accessibilityLabel="Search history filters"
      footer={<AppButton label={t('common.done')} size="compact" onPress={onClose} />}>
      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{t('search.history.filter.placeholder')}</Text>
        <View style={{ gap: spacing.xxs }}>
          {SEARCH_HISTORY_TIME_RANGE_OPTIONS.map((option) => {
            const selected = timeRange === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onTimeRangeChange(option.key)}
                style={({ pressed, hovered }) => [
                  styles.option,
                  {
                    minHeight: SEARCH_CONFIG_TOUCH_MIN,
                    borderRadius: surfaceRadius.button,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected || pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
                    paddingHorizontal: spacing.sm,
                  },
                ]}>
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{option.label}</Text>
                {selected ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
});
