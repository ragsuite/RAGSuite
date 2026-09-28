import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { WidgetTabMeta } from '@/config/widgets-navigation';
import { useTranslation } from '@/i18n';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  tab: WidgetTabMeta;
  active: boolean;
  onPress: () => void;
};

/** Primary pill tab (same chrome as the Sources type tabs). */
export function WidgetTabButton({ tab, active, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, radius, surfaceRadius, isWebParitySurfaces, mode } = useAppTheme();
  const Icon = tab.icon;
  const label = t(tab.labelKey);
  const resolveChrome = (pressed: boolean, hovered = false) =>
    getWebParityTabStyle({
      active,
      pressed,
      hovered,
      colors,
      surfaceRadius,
      brandRadius: radius.sm,
      useWebParity: isWebParitySurfaces,
      colorMode: mode,
    });
  const textColor = resolveChrome(false).textColor;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      accessibilityHint={t(tab.descriptionKey)}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.tab,
        getWebParityTabPressableStyle(resolveChrome(pressed, hovered), WEB_PARITY_TAB_HEIGHT_PRIMARY),
        { gap: spacing.xs, paddingHorizontal: spacing.md },
      ]}>
      <Icon size={16} color={textColor} />
      <Text numberOfLines={1} style={[typography.body, getWebParityTabLabelStyle(textColor, typography.body)]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: { flexDirection: 'row', flexShrink: 0 },
});
