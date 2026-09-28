import { Lock, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
  /** CE Enterprise locked teaser — shows Lock glyph beside the title. */
  enterpriseLocked?: boolean;
};

export function ProfileMenuRow({ icon: Icon, title, description, onPress, enterpriseLocked = false }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={enterpriseLocked ? `${title} (Enterprise)` : title}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.row,
        { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
        pressed ? { backgroundColor: colors.surfaceMuted } : hovered ? { backgroundColor: colors.surfaceHover } : null,
      ]}>
      <Icon size={16} strokeWidth={2} color={colors.textMuted} />
      <View style={styles.text}>
        <Text style={[typography.body, styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[typography.caption, styles.subtitle, { color: colors.textMuted }]}>{description}</Text>
      </View>
      {enterpriseLocked ? <Lock size={14} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontWeight: '500',
    fontSize: 14,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
});
