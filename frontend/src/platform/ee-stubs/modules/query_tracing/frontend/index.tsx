import { Lock } from 'lucide-react-native';
import React from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';

import { APP_CHROME_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const ENTERPRISE_PRICING_URL = 'https://www.ragsuite.de/pricing/#comparison';

/**
 * CE stub for CSV/JSON history export — opens edition comparison (no real export).
 * Real menu lives in EE `query_tracing`.
 */
export function ChatHistorySourceTraceCard(_props: Record<string, unknown>) {
  return null;
}

export function ChatHistoryTimingSpans(_props: Record<string, unknown>) {
  return null;
}

export function ChatHistoryExportMenu({ disabled = false }: { disabled?: boolean; onExport?: (format: 'csv' | 'json') => void }) {
  const { colors, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('enterprise.locked.features.queryTracing', {
        defaultValue: 'Deep query tracing',
      })}
      disabled={disabled}
      onPress={() => {
        void Linking.openURL(ENTERPRISE_PRICING_URL);
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          borderRadius: surfaceRadius.button,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          opacity: disabled ? 0.45 : 1,
          flexShrink: 0,
        },
      ]}>
      <Lock size={16} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: APP_CHROME_CONTROL_HEIGHT,
    height: APP_CHROME_CONTROL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
});
