import { MessageSquare, Search } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { HistoryKind } from '@/features/chat-history/types/chat-history.types';
import { useTranslation } from '@/i18n';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  active: HistoryKind;
  onChange: (kind: HistoryKind) => void;
};

const TABS: { key: HistoryKind; labelKey: string; icon: typeof MessageSquare }[] = [
  { key: 'chatbot', labelKey: 'history.tabs.chatbot', icon: MessageSquare },
  { key: 'search', labelKey: 'history.tabs.search', icon: Search },
];

/** Chatbot Config–matching pill tabs for History kind switcher. */
export function HistoryKindTabs({ active, onChange }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces, mode } = useAppTheme();
  const tabRadius = surfaceRadius.button;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.row, { gap: spacing.xs }]}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const Icon = tab.icon;
        const label = t(tab.labelKey);
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={t('history.tabs.a11y', { label })}
            onPress={() => onChange(tab.key)}
            style={({ pressed, hovered }) => {
              const chrome = getWebParityTabStyle({
                active: isActive,
                pressed,
                hovered,
                colors,
                surfaceRadius,
                brandRadius: tabRadius,
                useWebParity: isWebParitySurfaces,
                colorMode: mode,
              });
              return [
                styles.tab,
                getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                {
                  paddingHorizontal: spacing.sm,
                  gap: spacing.xs,
                },
              ];
            }}>
            <Icon
              size={14}
              color={
                getWebParityTabStyle({
                  active: isActive,
                  pressed: false,
                  colors,
                  surfaceRadius,
                  brandRadius: tabRadius,
                  useWebParity: isWebParitySurfaces,
                  colorMode: mode,
                }).textColor
              }
            />
            <Text
              style={[
                typography.caption,
                getWebParityTabLabelStyle(
                  getWebParityTabStyle({
                    active: isActive,
                    pressed: false,
                    colors,
                    surfaceRadius,
                    brandRadius: tabRadius,
                    useWebParity: isWebParitySurfaces,
                    colorMode: mode,
                  }).textColor,
                  typography.caption,
                ),
              ]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
