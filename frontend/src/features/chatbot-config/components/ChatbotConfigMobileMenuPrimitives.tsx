import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { NavGroupLabel } from '@/shared/components/brand';
import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function MobileMenuSectionLabel({ children }: { children: string }) {
  const { spacing } = useAppTheme();
  return (
    <NavGroupLabel style={{ marginBottom: spacing.xs, marginLeft: 2 }} accessibilityRole="header">
      {children}
    </NavGroupLabel>
  );
}

export function MobileMenuMetricChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const { colors, typography, surfaceRadius } = useAppTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: surfaceRadius.button,
        backgroundColor: colors.surfaceMuted,
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 2,
        flex: 1,
        minWidth: '30%',
      }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

type SummaryCardProps = {
  accessibilityLabel: string;
  accessibilityHint: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  disabled?: boolean;
  metrics?: React.ReactNode;
  fallback?: string;
};

export function MobileMenuSummaryCard({
  accessibilityLabel,
  accessibilityHint,
  title,
  subtitle,
  icon: Icon,
  onPress,
  disabled,
  metrics,
  fallback,
}: SummaryCardProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderRadius: surfaceRadius.card,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          padding: spacing.md,
          gap: spacing.sm,
          opacity: disabled ? 0.55 : 1,
        },
      ]}>
      <View style={styles.cardTopRow}>
        <View style={[styles.rowIconWrap, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.button }]}>
          <Icon size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.headingSemibold, { color: colors.text }]}>{title}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.textMuted} />
      </View>
      {metrics ?? (fallback ? <Text style={[typography.body, { color: colors.textMuted }]}>{fallback}</Text> : null)}
    </Pressable>
  );
}

export function MobileMenuGroup({ children }: { children: React.ReactNode }) {
  const { colors, surfaceRadius } = useAppTheme();
  return (
    <View style={[styles.menu, { borderRadius: surfaceRadius.card, borderColor: colors.border, backgroundColor: colors.surface }]}>
      {children}
    </View>
  );
}

type MenuRowProps = {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  isLast?: boolean;
  accessibilityHint?: string;
};

export function MobileMenuRow({ title, subtitle, icon: Icon, onPress, isLast, accessibilityHint }: MenuRowProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint ?? `Opens ${title}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.menuRow,
          {
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
            minHeight: CHATBOT_CONFIG_TOUCH_MIN,
            paddingVertical: spacing.sm,
          },
        ]}>
        <View style={[styles.labelWrap, { gap: spacing.xs }]}>
          <View style={[styles.rowIconWrap, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.button }]}>
            <Icon size={16} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{title}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
        </View>
        <ChevronRight size={16} color={colors.textMuted} />
      </Pressable>
      {!isLast ? <View style={[styles.divider, { backgroundColor: colors.border, marginLeft: 54 }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  menu: { borderWidth: 1, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  labelWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowIconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
});
