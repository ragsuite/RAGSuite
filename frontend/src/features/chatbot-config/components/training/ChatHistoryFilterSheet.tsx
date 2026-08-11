import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import type { HistoryTimeRange } from '@/features/chatbot-config/types/chatbot-config.types';
import { getChatbotConfigNav } from '@/features/chatbot-config/utils/chatbot-config-nav';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  timeRange: HistoryTimeRange;
  onTimeRangeChange: (value: HistoryTimeRange) => void;
};

export function ChatHistoryFilterSheet({
  visible,
  onClose,
  timeRange,
  onTimeRangeChange,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { HISTORY_TIME_RANGE_OPTIONS } = getChatbotConfigNav(t);

  return (
    <AdaptiveOverlay
      visible={visible}
      title={t('common.filter')}
      subtitle={t('chatbot.history.filter.placeholder')}
      onClose={onClose}
      accessibilityLabel="Chat history filters"
      footer={<AppButton label={t('common.done')} size="compact" onPress={onClose} />}>
      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{t('chatbot.history.filter.placeholder')}</Text>
        <View style={{ gap: spacing.xxs }}>
          {HISTORY_TIME_RANGE_OPTIONS.map((option) => {
            const selected = timeRange === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onTimeRangeChange(option.key)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    minHeight: CHATBOT_CONFIG_TOUCH_MIN,
                    borderRadius: surfaceRadius.button,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: pressed ? colors.surfaceMuted : selected ? colors.surfaceMuted : colors.surface,
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
