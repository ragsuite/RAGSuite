import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AppCard, AppCardContent } from '@/shared/components/surfaces/app-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  badge?: string;
  severity?: 'default' | 'success' | 'danger';
  valueSeverity?: 'default' | 'success' | 'danger';
};

export function KpiCard({ label, value, note, icon: Icon, badge, severity = 'default', valueSeverity = 'default' }: Props) {
  const { colors, spacing, surfaceRadius, isWebParitySurfaces, typography } = useAppTheme();
  const isWeb = Platform.OS === 'web';
  const webWide = isWeb && isWebParitySurfaces;
  const valueColor =
    valueSeverity === 'success' ? colors.success : valueSeverity === 'danger' ? colors.danger : colors.text;
  const notePrefix =
    severity === 'success' ? '↑ ' : severity === 'danger' ? '↓ ' : valueSeverity === 'success' ? '↑ ' : valueSeverity === 'danger' ? '↓ ' : '';

  return (
    <AppCard
      style={{
        flex: 1,
        minWidth: isWeb ? 180 : 140,
        minHeight: isWeb ? 114 : undefined,
      }}>
      <AppCardContent
        compact={!webWide}
        style={{
          gap: webWide ? spacing.sm : spacing.xxs,
          paddingVertical: webWide ? spacing.lg : spacing.sm,
          paddingHorizontal: webWide ? spacing.lg : spacing.sm,
        }}>
        <View style={styles.topRow}>
          <Text
            style={[
              typography.body,
              styles.label,
              { color: colors.textMuted, fontSize: webWide ? 14 : 11, fontWeight: '500' },
            ]}>
            {label}
          </Text>
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <Icon size={18} color={colors.textSoft} />
          </View>
        </View>
        <Text
          style={[
            typography.metric,
            {
              color: valueColor,
              fontSize: webWide ? 24 : isWeb ? 40 : 36,
              lineHeight: webWide ? 28 : isWeb ? 44 : 40,
            },
          ]}
          numberOfLines={1}>
          {value}
        </Text>
        {note ? (
          <Text
            style={[
              typography.caption,
              {
                color: severity === 'danger' || valueSeverity === 'danger' ? colors.danger : colors.textMuted,
              },
            ]}>
            {notePrefix}
            {note}
          </Text>
        ) : null}
        {badge ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: colors.dangerBackground, borderRadius: surfaceRadius.button },
            ]}>
            <Text style={[typography.caption, styles.badgeText, { color: colors.danger }]}>{badge}</Text>
          </View>
        ) : null}
      </AppCardContent>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    flex: 1,
    fontSize: 11,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 11,
  },
});
