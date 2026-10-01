import { History } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  retentionDays: number | null;
};

/** Shown only when the edition limits visible audit history (Community). */
export function AuditLogsRetentionNotice({ retentionDays }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();

  if (retentionDays == null) return null;

  return (
    <View style={[styles.row, { gap: spacing.xs }]} accessibilityRole="text">
      <History size={14} strokeWidth={1.5} color={colors.textSoft} />
      <Text style={[typography.caption, styles.text, { color: colors.textSoft }]}>
        {t('audit.retentionWindow.notice', { count: retentionDays })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flexShrink: 1,
  },
});
