import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Bot, ChartColumn, Gauge, Search, Settings } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getMobileTabBarBottomPadding,
  MOBILE_TAB_BAR_MIN_HEIGHT,
  MOBILE_TAB_BAR_PADDING_VERTICAL,
} from '@/shared/constants/mobile-tab-bar-layout';
import { useTranslation } from '@/i18n';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const TAB_LABEL_KEYS = {
  index: 'nav.overview',
  'crawl-management': 'nav.crawl',
  'chatbot-config': 'nav.tab.chat',
  'search-config': 'nav.tab.search',
  settings: 'nav.settings',
} as const;

const TAB_ICONS = {
  index: ChartColumn,
  'crawl-management': Gauge,
  'chatbot-config': Bot,
  'search-config': Search,
  settings: Settings,
} as const;

export function AppBottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, spacing, elevation, typography } = useAppTheme();
  const { t } = useTranslation();
  const { canAccessRoute } = useActiveProject();
  const insets = useSafeAreaInsets();
  const glassBackground = hexToRgba(colors.primaryPressed, 0.92);
  const glassBorder = hexToRgba(colors.textOnPrimary, 0.2);
  const inactiveIcon = hexToRgba(colors.textOnPrimary, 0.78);
  const inactiveLabel = hexToRgba(colors.textOnPrimary, 0.78);
  const activeBubble = colors.textOnPrimary;
  const activeIcon = colors.primaryPressed;
  const bottomPadding = getMobileTabBarBottomPadding(insets.bottom);

  return (
    <View style={[styles.safeAreaWrap, { paddingBottom: bottomPadding }]}>
      <View
        style={[
          styles.container,
          elevation.card,
          {
            backgroundColor: glassBackground,
            borderColor: glassBorder,
            borderRadius: 999,
            marginHorizontal: spacing.md,
            paddingHorizontal: 8,
            paddingVertical: MOBILE_TAB_BAR_PADDING_VERTICAL,
          },
        ]}>
        {state.routes.map((route, index) => {
          const labelKey = TAB_LABEL_KEYS[route.name as keyof typeof TAB_LABEL_KEYS];
          const icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS];
          if (!labelKey || !icon) return null;
          if (!canAccessRoute(route.name)) return null;
          const label = t(labelKey);

          const Icon = icon;

          const isFocused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={descriptors[route.key]?.options?.tabBarAccessibilityLabel}
              testID={descriptors[route.key]?.options?.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.tabItem,
                {
                  borderRadius: 999,
                  backgroundColor: isFocused ? activeBubble : pressed ? hexToRgba(colors.textOnPrimary, 0.08) : 'transparent',
                  opacity: pressed ? 0.95 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  marginHorizontal: 1,
                },
              ]}>
              <Icon size={18} color={isFocused ? activeIcon : inactiveIcon} />
              <Text
                numberOfLines={1}
                style={[
                  typography.caption,
                  styles.tabLabel,
                  { color: isFocused ? activeIcon : inactiveLabel },
                ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeAreaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    paddingTop: 0,
    pointerEvents: 'box-none',
  },
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MOBILE_TAB_BAR_MIN_HEIGHT,
  },
  tabItem: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
  },
});

function hexToRgba(hex: string, alpha: number) {
  const parsed = hex.replace('#', '');
  if (parsed.length !== 6) {
    return hex;
  }
  const r = Number.parseInt(parsed.slice(0, 2), 16);
  const g = Number.parseInt(parsed.slice(2, 4), 16);
  const b = Number.parseInt(parsed.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
