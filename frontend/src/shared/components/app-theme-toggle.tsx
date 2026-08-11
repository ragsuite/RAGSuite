import { Moon, Sun } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useSettings } from '@/features/settings/hooks/useSettings';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  size?: number;
  borderRadius?: number;
};

function hexToRgba(hex: string, alpha: number) {
  const parsed = hex.replace('#', '');
  if (parsed.length !== 6) return hex;
  const r = Number.parseInt(parsed.slice(0, 2), 16);
  const g = Number.parseInt(parsed.slice(2, 4), 16);
  const b = Number.parseInt(parsed.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function AppThemeToggle({ size = 34, borderRadius }: Props) {
  const { toggleTheme } = useSettings();
  const { colors, mode, surfaceRadius } = useAppTheme();
  const resolvedRadius = borderRadius ?? surfaceRadius.button;
  const { t } = useTranslation();
  const isDark = mode === 'dark';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('theme.toggle')}
      testID="button-theme-toggle"
      onPress={() => void toggleTheme()}
      style={({ pressed, hovered }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: resolvedRadius,
          borderColor: isDark ? colors.border : hexToRgba(colors.primary, 0.2),
          backgroundColor: pressed || hovered
            ? isDark
              ? colors.sidebarAccent
              : colors.primaryTint
            : isDark
              ? colors.surfaceMuted
              : hexToRgba(colors.primary, 0.07),
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}>
      {isDark ? <Sun size={16} strokeWidth={2.2} color={colors.textSoft} /> : <Moon size={16} strokeWidth={2.2} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
